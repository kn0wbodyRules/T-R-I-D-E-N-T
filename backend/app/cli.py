"""Operator CLI for ingestion.

    docker compose exec fastapi python -m app.cli --help

Ingestion is driven from here rather than from HTTP endpoints because these are
long, bandwidth-heavy operations run deliberately by a person, not request/
response work.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta
from pathlib import Path

import typer
from sqlalchemy import func, select, text

from app.db import SessionLocal
from app.ingest import cdse
from app.ingest.ais_csv import load_ais_csv
from app.ingest.coverage import coverage_envelope
from app.ingest.incidents import seed_incidents
from app.models import AisPosition, DriftEstimate, Incident, SarScene, SlickDetection, Vessel

app = typer.Typer(help="Oil-spill pipeline ingestion tools.", no_args_is_help=True)


def _get_incident(session, slug: str) -> Incident:
    incident = session.scalar(select(Incident).where(Incident.slug == slug))
    if incident is None:
        known = session.scalars(select(Incident.slug)).all()
        raise typer.BadParameter(
            f"Unknown incident {slug!r}. Known: {sorted(known) or 'none — run seed-incidents'}"
        )
    return incident


@app.command("seed-incidents")
def seed_incidents_cmd() -> None:
    """Load the documented incident registry (idempotent)."""
    with SessionLocal() as session:
        counts = seed_incidents(session)
    typer.echo(f"Incidents created={counts['created']} updated={counts['updated']}")


@app.command("search-scenes")
def search_scenes_cmd(
    incident: str = typer.Option(..., help="Incident slug, e.g. corsica-2018"),
    days_before: int = typer.Option(2, help="Days before the incident to search."),
    days_after: int = typer.Option(10, help="Days after the incident to search."),
    product_type: str = typer.Option("GRD", help="Sentinel-1 product type."),
    limit: int = typer.Option(50),
) -> None:
    """Search CDSE for Sentinel-1 scenes over an incident and register them.

    Registers metadata only — no rasters are downloaded.
    """
    with SessionLocal() as session:
        target = _get_incident(session, incident)
        aoi_wkt = session.scalar(
            select(func.ST_AsText(Incident.aoi)).where(Incident.id == target.id)
        )
        start = target.occurred_at - timedelta(days=days_before)
        end = target.occurred_at + timedelta(days=days_after)

        typer.echo(f"Searching CDSE {start:%Y-%m-%d} .. {end:%Y-%m-%d} over {incident}")
        try:
            products = asyncio.run(
                cdse.search_scenes(aoi_wkt, start, end, product_type, limit)
            )
        except cdse.CdseCredentialsMissing as exc:
            typer.secho(str(exc), fg=typer.colors.RED)
            raise typer.Exit(code=1) from exc

        counts = cdse.register_scenes(session, products, incident_id=target.id)

    typer.echo(
        f"Found {len(products)} products; created={counts['created']} "
        f"updated={counts['updated']} skipped={counts['skipped_no_footprint']}"
    )


@app.command("download-scene")
def download_scene_cmd(
    product_id: str = typer.Option(..., help="sar_scenes.product_id to fetch."),
) -> None:
    """Download one registered scene's raster (~1 GB)."""
    with SessionLocal() as session:
        scene = session.scalar(
            select(SarScene).where(SarScene.product_id == product_id)
        )
        if scene is None:
            raise typer.BadParameter(f"No registered scene {product_id!r}")

        size = f"{scene.size_bytes / 1e9:.2f} GB" if scene.size_bytes else "unknown size"
        typer.echo(f"Downloading {product_id} ({size})...")
        path = asyncio.run(cdse.download_scene(session, scene))
    typer.echo(f"Saved to {path}")


@app.command("backfill-scan-log")
def backfill_scan_log_cmd(
    product_id: str = typer.Option(..., help="sar_scenes.product_id to scan."),
    checkpoint: Path = typer.Option(..., exists=True),
    min_area_sq_km: float = typer.Option(0.01),
    keep_scene: bool = typer.Option(
        False, "--keep-scene", help="Skip deleting the downloaded raster after scanning."
    ),
) -> None:
    """Scan one registered scene and write scene_scan_log (+ detections if any).

    Downloads the scene first if it isn't already on disk. This is the manual
    equivalent of what a continuous watcher would do automatically per scene --
    same underlying scan_and_log, just invoked by hand for backfilling real
    history ahead of a demo.
    """
    from app.ml import configure_logging

    configure_logging()
    from app.ml.watcher import scan_and_log

    with SessionLocal() as session:
        scene = session.scalar(select(SarScene).where(SarScene.product_id == product_id))
        if scene is None:
            raise typer.BadParameter(f"No registered scene {product_id!r}")

        path = Path(scene.local_path) if scene.local_path else None
        if path is None or not path.exists():
            typer.echo(f"Downloading {product_id}...")
            path = asyncio.run(cdse.download_scene(session, scene))

        log_row = scan_and_log(session, scene, path, checkpoint, min_area_sq_km=min_area_sq_km)
        typer.echo(
            f"{product_id}: oil_detected={log_row.oil_detected} "
            f"confidence={log_row.detection_confidence}"
        )

        if not keep_scene and path.exists():
            path.unlink()
            scene.local_path = None
            session.commit()
            typer.echo(f"Deleted {path}")


@app.command("load-ais")
def load_ais_cmd(
    path: Path = typer.Option(..., exists=True, help="CSV of AIS positions."),
    source: str = typer.Option(
        ...,
        help=(
            "Provenance tag: kpler | marinetraffic | csv | reconstructed. "
            "Use 'reconstructed' for tracks digitised from investigation reports."
        ),
    ),
    incident: str | None = typer.Option(None, help="Incident slug to attach rows to."),
) -> None:
    """Bulk-load a historical AIS file."""
    with SessionLocal() as session:
        incident_id = _get_incident(session, incident).id if incident else None
        stats = load_ais_csv(session, path, source=source, incident_id=incident_id)
    typer.echo(
        f"Read {stats['read']} rows; inserted {stats['inserted']}; "
        f"skipped {stats['duplicates_skipped']} duplicates"
    )


@app.command("listen-ais")
def listen_ais_cmd(
    incident: str = typer.Option(..., help="Incident slug supplying the bounding box."),
    duration: float = typer.Option(60, help="Seconds to listen."),
) -> None:
    """Stream live AIS for an incident's AOI (coastal coverage only)."""
    from app.ingest import aisstream

    with SessionLocal() as session:
        target = _get_incident(session, incident)
        bounds = session.execute(
            select(
                func.ST_XMin(Incident.aoi),
                func.ST_YMin(Incident.aoi),
                func.ST_XMax(Incident.aoi),
                func.ST_YMax(Incident.aoi),
            ).where(Incident.id == target.id)
        ).one()

    typer.echo(f"Listening {duration:.0f}s over {incident} {tuple(bounds)}")
    try:
        stats = asyncio.run(aisstream.listen(tuple(bounds), duration_seconds=duration))
    except aisstream.AisStreamCredentialsMissing as exc:
        typer.secho(str(exc), fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc
    typer.echo(f"Received {stats['received']}; inserted {stats['inserted']}")


@app.command("scenes")
def scenes_cmd(
    incident: str | None = typer.Option(None, help="Filter to one incident slug."),
    distinct: bool = typer.Option(
        True,
        help="Collapse packaging variants so each real acquisition appears once.",
    ),
) -> None:
    """List registered scenes."""
    with SessionLocal() as session:
        incident_id = _get_incident(session, incident).id if incident else None

        if distinct:
            rows = cdse.distinct_acquisitions(session, incident_id=incident_id)
        else:
            query = select(SarScene)
            if incident_id is not None:
                query = query.where(SarScene.incident_id == incident_id)
            rows = session.scalars(query.order_by(SarScene.acquired_at)).all()

        total = session.scalar(
            select(func.count(SarScene.id)).where(
                SarScene.incident_id == incident_id
                if incident_id is not None
                else True
            )
        )

        reference = (
            session.scalar(select(Incident).where(Incident.id == incident_id))
            if incident_id
            else None
        )

        for scene in rows:
            size = f"{scene.size_bytes / 1e9:5.2f} GB" if scene.size_bytes else "     ?"
            # Offset from the incident is the headline number for drift: it sets
            # how long the oil had to move before the satellite saw it, and so
            # how wide the backtracking search window has to be.
            offset = ""
            if reference is not None:
                hours = (
                    scene.acquired_at - reference.occurred_at
                ).total_seconds() / 3600
                offset = f"{hours:+7.1f}h "
            typer.echo(
                f"  {scene.acquired_at:%Y-%m-%d %H:%M}  {offset}"
                f"{scene.product_format or '-':<4} "
                f"{size}  {scene.download_status:<9} {scene.product_id[:48]}"
            )

    if distinct:
        typer.echo(
            f"\n{len(rows)} distinct acquisitions (from {total} catalogue entries)"
        )
    else:
        typer.echo(f"\n{len(rows)} catalogue entries")


@app.command("status")
def status_cmd() -> None:
    """Summarise what has been ingested so far."""
    with SessionLocal() as session:
        incidents = session.scalars(select(Incident).order_by(Incident.slug)).all()
        typer.echo(f"Incidents: {len(incidents)}")
        for incident in incidents:
            scenes = session.scalar(
                select(func.count(SarScene.id)).where(
                    SarScene.incident_id == incident.id
                )
            )
            positions = session.scalar(
                select(func.count(AisPosition.id)).where(
                    AisPosition.incident_id == incident.id
                )
            )
            validates = ", ".join(incident.validates or []) or "-"
            typer.echo(
                f"  {incident.slug:<18} {incident.occurred_at:%Y-%m-%d}  "
                f"validates[{validates}]  scenes={scenes}  ais={positions}"
            )

        total_scenes = session.scalar(select(func.count(SarScene.id)))
        downloaded = session.scalar(
            select(func.count(SarScene.id)).where(
                SarScene.download_status == "complete"
            )
        )
        total_positions = session.scalar(select(func.count(AisPosition.id)))
        vessels = session.scalar(select(func.count(Vessel.mmsi)))

        typer.echo(
            f"\nScenes: {total_scenes} registered, {downloaded} downloaded\n"
            f"AIS positions: {total_positions}\n"
            f"Vessels: {vessels}"
        )

        by_source = session.execute(
            text(
                "SELECT source, COUNT(*) AS n FROM ais_positions "
                "GROUP BY source ORDER BY n DESC"
            )
        ).all()
        if by_source:
            typer.echo("AIS by source:")
            for source, count in by_source:
                typer.echo(f"  {source:<16} {count}")


@app.command("coverage")
def coverage_cmd(
    incident: str = typer.Option(..., help="Incident slug."),
    days: int = typer.Option(7, help="Window around the incident, in days."),
) -> None:
    """Report the empirical AIS coverage envelope for an incident window."""
    with SessionLocal() as session:
        target = _get_incident(session, incident)
        envelope = coverage_envelope(
            session,
            target.occurred_at - timedelta(days=days),
            target.occurred_at + timedelta(days=days),
        )
    typer.echo(envelope.describe())
    if not envelope.is_empty:
        typer.echo(f"Envelope: {envelope.wkt[:160]}...")


@app.command("prepare-training-data")
def prepare_training_data_cmd(
    archive_dir: Path = typer.Option(
        ..., exists=True, help="Directory holding the Zenodo .7z / .zip archives."
    ),
    output_dir: Path = typer.Option(
        Path("/data/training"), help="Where to extract and write tiles."
    ),
    tile_size: int = typer.Option(256),
    skip_extract: bool = typer.Option(
        False, help="Re-tile from an existing extraction without re-extracting."
    ),
) -> None:
    """Extract the Zenodo/SOS archives and cut training tiles. Run once."""
    # Imported here, not at module scope: the fastapi image has none of the ML
    # dependencies installed, and a top-level import would break every other
    # command in this file there. Same reason listen-ais imports aisstream late.
    from app.ml import configure_logging

    configure_logging()
    from app.ml import data_prep

    stats = data_prep.prepare(
        archive_dir, output_dir, tile_size=tile_size, skip_extract=skip_extract
    )
    typer.echo(
        f"Archives: {stats['archives']}\n"
        f"Source pairs: {stats['source_pairs']}\n"
        f"Tiles: {stats['tiles']}"
    )


@app.command("train-segmentation")
def train_segmentation_cmd(
    data_dir: Path = typer.Option(Path("/data/training"), exists=True),
    epochs: int = typer.Option(40),
    batch_size: int = typer.Option(
        64,
        help="64 measured fastest on an 8 GB card (3.5 GB peak); 96 is slower, "
        "being data-loader bound. Drop to 32 if CUDA runs out of memory.",
    ),
    lr: float = typer.Option(1e-4),
    encoder: str = typer.Option("resnet34"),
    num_workers: int = typer.Option(8),
    resume: Path | None = typer.Option(None, help="Checkpoint to resume from."),
    tag: str = typer.Option(
        "", help="Suffix for the checkpoint name, to keep runs separable."
    ),
    radiometric_shift: bool = typer.Option(
        True,
        help="Wide additive-dB brightness augmentation for domain-shift robustness. "
        "Disable to isolate a different robustness mechanism (e.g. local-contrast "
        "channels) from this one's effect, per this project's single-variable "
        "experiment convention.",
    ),
    use_contrast_channels: bool = typer.Option(
        False,
        help="Add windowed local-contrast (CFAR-style) channels alongside VV/VH. "
        "If tiles-dir's tiles are already 4-channel (see migrate-tiles-add-contrast) "
        "this just confirms the intent; against a plain 2-channel directory it "
        "computes the extra channels on the fly instead. Recorded in the "
        "checkpoint's config so inference and evaluation pick the same channel "
        "count back up automatically.",
    ),
    tiles_dir: Path | None = typer.Option(
        None,
        exists=True,
        help="Overrides data-dir/tiles -- e.g. a directory produced by "
        "migrate-tiles-add-contrast that isn't laid out under data-dir.",
    ),
) -> None:
    """Train the DeepLabv3+ oil-slick segmentation model."""
    from app.ml import configure_logging

    configure_logging()
    from app.ml import train

    result = train.run(
        data_dir,
        epochs=epochs,
        batch_size=batch_size,
        lr=lr,
        encoder=encoder,
        num_workers=num_workers,
        resume=resume,
        tag=tag,
        radiometric_shift=radiometric_shift,
        use_contrast_channels=use_contrast_channels,
        tiles_dir=tiles_dir,
    )
    typer.echo(
        f"Best oil/look-alike mIoU {result['best_metric']:.4f} at epoch "
        f"{result['best_epoch']}\nCheckpoint: {result['checkpoint_path']}"
    )


@app.command("evaluate-segmentation")
def evaluate_segmentation_cmd(
    checkpoint: Path = typer.Option(..., exists=True),
    test_dir: Path = typer.Option(Path("/data/training/raw/part3_test"), exists=True),
    limit: int | None = typer.Option(None, help="Evaluate only the first N images."),
) -> None:
    """Per-class IoU on the held-out Part III test set."""
    from app.ml import configure_logging

    configure_logging()
    from app.ml import evaluate

    metrics = evaluate.run(checkpoint, test_dir, limit=limit)
    typer.echo(f"Model: {metrics['model_version']} over {metrics['images']} images")
    for name, value in metrics["class_iou"].items():
        typer.echo(f"  {name:<12} IoU {value:.4f}  (pixel-pooled)")
    typer.echo(
        f"  oil          IoU {metrics['per_image_mean_oil_iou']:.4f}  "
        f"(per-image mean, oil-ground-truth images only)"
    )
    typer.echo(
        f"  oil          IoU {metrics['per_image_median_oil_iou']:.4f}  (per-image median)"
    )
    typer.echo(
        "\nPixel-pooled and per-image can diverge sharply if a few images have "
        "unusually large or small oil coverage -- pooled weights every pixel "
        "equally, so those images can dominate it. Worst 5 oil images by IoU "
        "(look-alike/no-oil false alarms are a separate question -- see "
        "validate-visual):"
    )
    for d in metrics["worst_images"]:
        typer.echo(
            f"  {Path(d['image']).name:<28} truth {d['truth_oil_frac']*100:5.1f}%  "
            f"pred {d['pred_oil_frac']*100:5.1f}%  IoU {d['iou']:.4f}"
        )

    typer.echo(
        "\nCleaned (post-cleanup, matches infer-scene production behaviour -- "
        "same speckle/min-blob filter, not a re-tuned threshold):"
    )
    for name, value in metrics["class_iou_cleaned"].items():
        typer.echo(f"  {name:<12} IoU {value:.4f}  (pixel-pooled)")
    typer.echo(
        f"  oil          IoU {metrics['per_image_mean_oil_iou_cleaned']:.4f}  (per-image mean)"
    )
    typer.echo(
        f"  oil          IoU {metrics['per_image_median_oil_iou_cleaned']:.4f}  (per-image median)"
    )


@app.command("validate-visual")
def validate_visual_cmd(
    checkpoint: Path = typer.Option(..., exists=True),
    test_dir: Path = typer.Option(Path("/data/training/raw/part3_test"), exists=True),
    out_dir: Path = typer.Option(Path("/data/ml/validation")),
    per_category: int = typer.Option(6, help="Scenes to render per category."),
) -> None:
    """Render predictions over held-out scenes and report per-category errors."""
    from app.ml import configure_logging, validate_visual

    configure_logging()
    report = validate_visual.run(checkpoint, test_dir, out_dir, per_category)

    summary = report.pop("_summary")
    for category, stats in sorted(report.items()):
        typer.echo(
            f"{category:<18} {stats['scenes']:>4} scenes | "
            f"detected in {stats['scenes_with_any_detection']:>4} "
            f"({stats['detection_rate']:.1%}) | pixel IoU {stats['pixel_iou']:.4f}"
        )
    typer.echo("")
    typer.echo(f"Oil detection rate:        {summary['oil_detection_rate']:.1%}")
    # These two categories contain no oil at all, so any detection is a false
    # alarm -- and a detector that cries wolf on look-alikes is the failure this
    # project exists to avoid.
    typer.echo(f"Look-alike false alarms:   {summary['lookalike_false_alarm_rate']:.1%}")
    typer.echo(f"Clean-sea false alarms:    {summary['nooil_false_alarm_rate']:.1%}")
    typer.echo(
        "\nCleaned (post-cleanup, matches infer-scene production behaviour -- "
        "same speckle/min-blob filter, not a re-tuned threshold):"
    )
    typer.echo(f"Oil detection rate:        {summary['oil_detection_rate_cleaned']:.1%}")
    typer.echo(f"Look-alike false alarms:   {summary['lookalike_false_alarm_rate_cleaned']:.1%}")
    typer.echo(f"Clean-sea false alarms:    {summary['nooil_false_alarm_rate_cleaned']:.1%}")
    typer.echo("")
    typer.echo(f"Renders written to {summary['renders']}")


@app.command("migrate-tiles-add-contrast")
def migrate_tiles_add_contrast_cmd(
    tiles_dir: Path = typer.Option(Path("/data/training/tiles"), exists=True),
    out_dir: Path = typer.Option(..., help="New tiles directory for 4-channel tiles."),
    window: int = typer.Option(15, help="Local-contrast window size (pixels)."),
    lookalike_fp_source: Path | None = typer.Option(
        None,
        exists=True,
        help="tile_lookalike_fp.json to carry into the new directory instead of "
        "tiles-dir's current one -- e.g. the mining state that produced a specific "
        "prior checkpoint, to keep an A/B comparison to one changed variable.",
    ),
    workers: int | None = typer.Option(None, help="Defaults to cpu_count-2, capped at 12."),
) -> None:
    """Produce a 4-channel (VV/VH + local-contrast) mirror of a 2-channel tiles
    directory, without needing the original raw archives. Resumable."""
    from app.ml import configure_logging

    configure_logging()
    from app.ml.radiometric import migrate_tiles_add_contrast

    counts = migrate_tiles_add_contrast(
        tiles_dir, out_dir, window=window, lookalike_fp_source=lookalike_fp_source, workers=workers
    )
    typer.echo(f"Migrated tiles into {out_dir}: {counts}")


@app.command("mine-hard-negatives")
def mine_hard_negatives_cmd(
    checkpoint: Path = typer.Option(..., exists=True, help="Checkpoint to mine mistakes from."),
    tiles_dir: Path = typer.Option(Path("/data/training/tiles"), exists=True),
    out_path: Path | None = typer.Option(
        None,
        help="Defaults to <tiles-dir>/tile_lookalike_fp.json. OVERWRITES any "
        "existing file there -- back it up first if you want to keep it.",
    ),
) -> None:
    """Re-mine look-alike hard negatives: which train tiles fool this checkpoint."""
    from app.ml import configure_logging

    configure_logging()
    from app.ml import _mine_hard_negatives

    stats = _mine_hard_negatives.run(checkpoint, tiles_dir, out_path)
    typer.echo(
        f"Mined {stats['lookalike_tiles']} look-alike tiles against "
        f"{Path(stats['checkpoint']).name}: {stats['any_fp']} fool it "
        f"({100 * stats['any_fp'] / stats['lookalike_tiles']:.1f}%), "
        f"mean FP fraction {stats['mean_fp_fraction']:.4f}\nWrote {stats['out_path']}"
    )


@app.command("check-champion")
def check_champion_cmd(
    checkpoint: Path = typer.Option(..., exists=True),
    test_dir: Path = typer.Option(Path("/data/training/raw/part3_test"), exists=True),
    manifest: Path = typer.Option(Path("/data/ml/checkpoints/champion.json")),
    promote: bool = typer.Option(
        False, "--promote", help="Write the manifest if the gate says PROMOTE (or with --force)."
    ),
    force: bool = typer.Option(
        False,
        "--force",
        help="Override a MARGINAL/REJECT verdict. Requires --promote. Use only "
        "after a deliberate manual decision, never as a default.",
    ),
    domain_shift_report: Path | None = typer.Option(
        None,
        "--domain-shift-report",
        exists=True,
        help="Optional domain-shift-sweep JSON (see domain-shift-sweep --out-path) "
        "to record on the manifest. Tracked only -- does not affect the verdict.",
    ),
) -> None:
    """Evaluate a checkpoint against Part III and compare it to the recorded champion."""
    import json

    from app.ml import configure_logging

    configure_logging()
    from app.ml import champion, evaluate, validate_visual

    eval_report = evaluate.run(checkpoint, test_dir)
    visual_report = validate_visual.run(
        checkpoint, test_dir, out_dir=Path("/data/ml/validation") / f"{checkpoint.stem}_champion_check"
    )
    shift_report = json.loads(domain_shift_report.read_text()) if domain_shift_report else None
    candidate_metrics = champion.metrics_from_reports(eval_report, visual_report, shift_report)
    prior = champion.load_champion(manifest)
    verdict, reasons = champion.gate(prior, candidate_metrics)

    typer.echo(f"Candidate: {checkpoint.name}")
    for key, value in candidate_metrics.items():
        rendered = f"{value:.4f}" if isinstance(value, float) else str(value)
        typer.echo(f"  {key:<38} {rendered}")
    if prior:
        typer.echo(f"\nChampion:  {prior['checkpoint']}")

    typer.echo(f"\nVerdict: {verdict}")
    for reason in reasons:
        typer.echo(f"  - {reason}")

    should_write = promote and (verdict == "PROMOTE" or force)
    if should_write:
        champion.write_champion(
            manifest, checkpoint, eval_report["model_version"], candidate_metrics, test_dir,
            promoted_via="check-champion --force" if (verdict != "PROMOTE" and force) else "check-champion",
        )
        typer.echo(f"\nWrote new champion to {manifest}")
    elif promote:
        typer.echo(f"\n--promote given but verdict is {verdict}; not writing (pass --force to override).")
    else:
        typer.echo("\n(dry run -- pass --promote to update the manifest)")


@app.command("domain-shift-sweep")
def domain_shift_sweep_cmd(
    checkpoint: Path = typer.Option(..., exists=True),
    test_dir: Path = typer.Option(Path("/data/training/raw/part3_test"), exists=True),
    offsets_db: str = typer.Option(
        "0,3,6,10,15,20", help="Comma-separated additive dB shifts to sweep."
    ),
    limit: int | None = typer.Option(None, help="Evaluate only a stride-sampled subset."),
    out_path: Path | None = typer.Option(None, help="Also write the full report as JSON."),
) -> None:
    """Measure recall/false-alarm degradation under a synthetic absolute dB shift.

    Diagnoses whether a checkpoint relies on absolute SAR backscatter level
    rather than local contrast -- the failure mode that caused zero detections
    on a real Sentinel-1 scene despite strong Part III benchmark numbers.
    """
    import json

    from app.ml import configure_logging

    configure_logging()
    from app.ml import evaluate

    offsets = tuple(float(x) for x in offsets_db.split(","))
    report = evaluate.run_domain_shift_sweep(checkpoint, test_dir, offsets_db=offsets, limit=limit)

    typer.echo(f"Model: {report['model_version']} over {report['images']} images")
    typer.echo(f"{'offset_dB':>10} {'oil_recall':>11} {'median_oil_iou':>15} {'lookalike_fp':>13} {'nooil_fp':>10}")
    for offset in report["offsets_db"]:
        m = report["per_offset"][str(offset)]
        typer.echo(
            f"{offset:>+10.0f} {m['oil_pixel_recall']:>11.4f} {m['per_image_median_oil_iou']:>15.4f} "
            f"{m['lookalike_false_alarm_rate']:>13.4f} {m['nooil_false_alarm_rate']:>10.4f}"
        )

    if out_path:
        out_path.write_text(json.dumps(report, indent=2))
        typer.echo(f"\nWrote {out_path}")


@app.command("check-real-scene")
def check_real_scene_cmd(
    checkpoint: Path = typer.Option(..., exists=True),
    scene_path: Path = typer.Option(..., exists=True),
    out_path: Path | None = typer.Option(None, help="Also write the full report as JSON."),
) -> None:
    """Qualitative OIL-probability check at a known real-scene anomaly location.

    No ground truth exists for this scene, so this is informational only and
    is never used by check-champion's gate -- it's the most direct check of
    whether a fix moves the needle on the real case that motivated this work.
    """
    import json

    from app.ml import configure_logging

    configure_logging()
    from app.ml import evaluate

    report = evaluate.run_real_scene_smoke_check(checkpoint, scene_path)
    typer.echo(f"Model: {report['model_version']} on {Path(report['scene']).name}")
    typer.echo(f"  OIL prob max={report['oil_prob_max']:.4f} mean={report['oil_prob_mean']:.4f}")
    typer.echo(
        f"  pixels >0.5 prob: {report['pixels_above_0.5']}/{report['patch_pixels']}  "
        f"argmax-OIL pixels: {report['pixels_predicted_oil']}/{report['patch_pixels']}"
    )

    if out_path:
        out_path.write_text(json.dumps(report, indent=2))
        typer.echo(f"\nWrote {out_path}")


@app.command("infer-scene")
def infer_scene_cmd(
    product_id: str = typer.Option(..., help="sar_scenes.product_id, already downloaded."),
    checkpoint: Path = typer.Option(..., exists=True),
    min_area_sq_km: float = typer.Option(0.01, help="Discard blobs below this area."),
    wind_speed_ms: float | None = typer.Option(
        None, help="Wind at acquisition time; sharpens the age estimate."
    ),
    batch_size: int = typer.Option(8),
) -> None:
    """Segment a downloaded scene and persist the slick detections."""
    with SessionLocal() as session:
        scene = session.scalar(
            select(SarScene).where(SarScene.product_id == product_id)
        )
        if scene is None:
            raise typer.BadParameter(f"No registered scene {product_id!r}")
        if scene.download_status != "complete" or not scene.local_path:
            raise typer.BadParameter(
                f"Scene {product_id!r} is registered but not downloaded "
                f"(status: {scene.download_status})."
            )

        from app.ml import configure_logging, inference, persist, postprocess

        configure_logging()
        typer.echo(f"Running inference on {product_id}...")
        result = inference.infer_scene(
            Path(scene.local_path), checkpoint, batch_size=batch_size
        )
        candidates = postprocess.extract_slicks(
            result.class_map, result.to_lonlat, min_area_sq_km=min_area_sq_km
        )
        if not candidates:
            typer.echo("No slicks above the area threshold.")
            return

        saved = persist.save_detections(
            session, scene, result, candidates, wind_speed_ms=wind_speed_ms
        )

    typer.echo(f"Saved {len(saved)} slick detection(s):")
    for detection in saved:
        age = (detection.attributes or {}).get("age_estimate", {})
        flag = " [OUT OF DOMAIN]" if detection.domain_gap_flag else ""
        typer.echo(
            f"  {detection.area_sq_km:.3f} km2 | age {age.get('band', '?')} "
            f"({age.get('confidence', '?')} confidence){flag}"
        )


@app.command("analyze-detection")
def analyze_detection_cmd(
    detection_id: int | None = typer.Option(
        None, help="slick_detections.id. Omit to use the largest-area detection for --product-id."
    ),
    product_id: str | None = typer.Option(
        None, help="sar_scenes.product_id -- picks that scene's largest-area detection."
    ),
    ensemble_size: int = typer.Option(50, help="OpenDrift ensemble members."),
) -> None:
    """Run Steps 3-5 (temporal bound -> seed points -> backward drift -> origin
    heatmap) for one real, already-persisted slick detection.

    Chains real data through every stage: the detection's own real geometry
    (Step 2's output) becomes Step 4's seed points; Step 3's bound comes from
    a real scene_scan_log query; Step 5 fetches real CMEMS/ERA5 forcing and
    runs a real OpenDrift ensemble. Nothing here is a stand-in value.
    """
    from app.ml import configure_logging

    configure_logging()
    from app.drift.pipeline import analyze_detection

    with SessionLocal() as session:
        if detection_id is not None:
            detection = session.get(SlickDetection, detection_id)
            if detection is None:
                raise typer.BadParameter(f"No slick_detections row with id={detection_id}")
        elif product_id is not None:
            detection = session.scalar(
                select(SlickDetection)
                .join(SarScene, SlickDetection.scene_id == SarScene.id)
                .where(SarScene.product_id == product_id)
                .order_by(SlickDetection.area_sq_km.desc())
            )
            if detection is None:
                raise typer.BadParameter(f"No slick_detections rows for scene {product_id!r}")
        else:
            raise typer.BadParameter("Pass --detection-id or --product-id")

        typer.echo(
            f"Analyzing detection {detection.id}: {detection.area_sq_km:.3f} km2 "
            f"at {detection.detected_at.isoformat()}"
        )
        estimate = analyze_detection(session, detection, ensemble_size=ensemble_size)

    centroid_wkt = None
    with SessionLocal() as session:
        centroid_wkt = session.execute(
            text("SELECT ST_AsText(origin_centroid) FROM drift_estimates WHERE id = :id"),
            {"id": estimate.id},
        ).scalar()

    typer.echo(
        f"\nDriftEstimate {estimate.id}: backtrack_hours={estimate.backtrack_hours} "
        f"ensemble_size={estimate.ensemble_size}"
    )
    typer.echo(f"Origin centroid: {centroid_wkt}")
    typer.echo(f"Window: {estimate.window_start.isoformat()} .. {estimate.window_end.isoformat()}")


@app.command("attribute-detection")
def attribute_detection_cmd(
    drift_estimate_id: int = typer.Option(..., help="drift_estimates.id from analyze-detection."),
    training_scenarios: int = typer.Option(
        40, help="Synthetic scenarios to train the scorer on -- never Corsica's real evidence, see scoring.py."
    ),
) -> None:
    """Run Steps 6-8 (AIS candidate search, dark-vessel CFAR detection,
    VIIRS corroboration, synthetic-trained XGBoost scoring) for one real
    DriftEstimate, and print the ranked candidates.

    No segmentation checkpoint needed here -- CFAR (Step 6b) only ever used
    the scene's calibrated backscatter, never the oil/sea model output (see
    inference.read_backscatter).
    """
    from app.ml import configure_logging

    configure_logging()
    from app.attribution.pipeline import run_attribution

    with SessionLocal() as session:
        drift_estimate = session.get(DriftEstimate, drift_estimate_id)
        if drift_estimate is None:
            raise typer.BadParameter(f"No drift_estimates row with id={drift_estimate_id}")

        candidates = run_attribution(
            session, drift_estimate, training_scenarios=training_scenarios
        )

    if not candidates:
        typer.echo("No candidates found.")
        return

    typer.echo(f"\n{len(candidates)} ranked candidate(s):")
    for c in candidates:
        label = f"MMSI {c.mmsi}" if c.mmsi else f"DARK contact (ship_detection_id={c.sar_ship_detection_id})"
        typer.echo(f"  #{c.rank}  {label:<45} confidence={c.confidence:.3f}")


if __name__ == "__main__":
    app()
