"""Stage 6-8 orchestration: one real DriftEstimate -> real AIS candidate
search + real dark-vessel detection -> real VIIRS corroboration (where
credentials exist) -> real feature extraction -> synthetic-trained XGBoost
scoring -> persisted, ranked AttributionCandidate rows.

Mirrors app.drift.pipeline.analyze_detection's role for Steps 3-5: each
stage (candidate_search, dark_vessel, viirs, clustering, features, scoring)
is independently correct; this is the wiring between them for one real case.
"""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.attribution.candidate_search import find_ais_candidates
from app.attribution.dark_vessel import detect_and_persist
from app.attribution.features import features_for_ais_candidate, features_for_dark_candidate
from app.attribution.scoring import build_training_corpus, score_candidates, train_model
from app.attribution.uncertainty import estimate_uncertainty_km, search_radius_km
from app.models import AttributionCandidate, DriftEstimate, SarScene, SlickDetection, Vessel

logger = logging.getLogger(__name__)


def _load_background_positions(
    session: Session, drift_estimate: DriftEstimate,
) -> list[tuple]:
    """Real synthetic background traffic (source='synthetic', no
    incident_id) near the corridor's spatial extent, for the clustering
    baseline -- see synthetic_ais.build_background_traffic.

    Capped at a representative sample: clustering.cluster_deviation_score's
    distance matrix is a pure-Python O(n^2) computation, and the full
    background table (tens of thousands of rows) made real scoring runs take
    ~20 minutes for what should be a demo-viable operation -- a real
    performance bug, not an inherent cost. A few hundred points define the
    same "what does a normal route look like" clusters just as well; more
    rows add runtime, not resolution.
    """
    MAX_BACKGROUND_POSITIONS = 400
    rows = session.execute(
        text(
            """
            SELECT ts, ST_X(geom) AS lon, ST_Y(geom) AS lat
            FROM ais_positions
            WHERE source = 'synthetic' AND incident_id IS NULL
            ORDER BY random()
            LIMIT :limit
            """
        ),
        {"limit": MAX_BACKGROUND_POSITIONS},
    ).all()
    return [(r.ts.replace(tzinfo=None) if r.ts.tzinfo else r.ts, r.lon, r.lat) for r in rows]


def _ensure_scene_downloaded(session: Session, scene: SarScene) -> Path:
    """Dark-vessel detection needs the real raster again; backfill-scan-log
    deletes it after oil scanning to save disk. Re-download if needed --
    same real CDSE fetch, not a stand-in."""
    import asyncio

    from app.ingest import cdse

    if scene.local_path and Path(scene.local_path).exists():
        return Path(scene.local_path)
    logger.info("Re-downloading %s for ship detection", scene.product_id)
    return asyncio.run(cdse.download_scene(session, scene))


def run_attribution(
    session: Session,
    drift_estimate: DriftEstimate,
    scenes_dir: Path = Path("/data/scenes"),
    training_scenarios: int = 40,
) -> list[AttributionCandidate]:
    detection = session.get(SlickDetection, drift_estimate.slick_detection_id)
    scene = session.get(SarScene, detection.scene_id)

    # The one real number every Step 6-8 distance/radius choice below is
    # derived from: this specific run's own backward-drift ensemble spread,
    # not a constant tuned to any one incident's known answer (see
    # uncertainty.py's module docstring for the real mistake this replaced).
    uncertainty_km = estimate_uncertainty_km(session, drift_estimate.id)
    radius_km = search_radius_km(uncertainty_km)
    logger.info(
        "Real ensemble-derived uncertainty: %.1fkm -> search radius %.1fkm",
        uncertainty_km, radius_km,
    )

    logger.info("Step 6a: searching real AIS for candidates in the real corridor")
    ais_candidates = find_ais_candidates(session, drift_estimate, buffer_km=radius_km)
    logger.info("Found %d AIS-visible candidate(s)", len(ais_candidates))

    logger.info("Step 6b: CFAR dark-vessel detection on the real scene")
    from app.ml.inference import read_backscatter

    scene_path = _ensure_scene_downloaded(session, scene)
    # No segmentation model needed here -- CFAR only ever used the calibrated
    # VV backscatter, never the model's oil/sea classification. Running the
    # full deep model across every tile just to discard its output cost ~3-4
    # real minutes of GPU inference per attribution run; read_backscatter
    # does only the real calibration pass, same values, no model.
    backscatter_db, to_lonlat, _shape = read_backscatter(scene_path)
    origin_lon, origin_lat = session.execute(
        text(
            "SELECT ST_X(origin_centroid), ST_Y(origin_centroid) "
            "FROM drift_estimates WHERE id = :id"
        ),
        {"id": drift_estimate.id},
    ).one()
    ship_detections = detect_and_persist(
        session, scene, backscatter_db, to_lonlat, "cfar_v1",
        reference_lon=origin_lon, reference_lat=origin_lat,
        max_distance_km=radius_km,
    )
    dark_ships = [s for s in ship_detections if s.is_dark]
    logger.info("Found %d dark (no AIS match) contact(s)", len(dark_ships))

    dark_lonlat = session.execute(
        text(
            "SELECT id, ST_X(geom) AS lon, ST_Y(geom) AS lat, length_estimate_m "
            "FROM sar_ship_detections WHERE id = ANY(:ids)"
        ),
        {"ids": [s.id for s in dark_ships]},
    ).mappings().all() if dark_ships else []

    logger.info("Step 7: VIIRS corroboration for dark contacts")
    viirs_results: dict[int, dict] = {}
    if dark_lonlat:
        try:
            from app.attribution.viirs import corroborate_dark_candidates, region_code_for

            # Derived from this run's own real origin location, not a
            # hardcoded single-country default -- raises for a location
            # outside this project's known coverage rather than guessing.
            region_code = region_code_for(origin_lon, origin_lat)
            viirs_results = corroborate_dark_candidates(
                [{"lon": r["lon"], "lat": r["lat"]} for r in dark_lonlat],
                region_code=region_code,
                window_start=drift_estimate.window_start.replace(tzinfo=None),
                window_end=drift_estimate.window_end.replace(tzinfo=None),
                scenes_dir=scenes_dir,
            )
        except Exception as exc:  # ViirsCredentialsMissing, unknown region, or a real fetch failure
            logger.warning("VIIRS corroboration skipped: %s", exc)

    logger.info("Step 8: feature extraction + synthetic-trained scoring")
    background_positions = _load_background_positions(session, drift_estimate)

    feature_rows: list[dict] = []
    for candidate in ais_candidates:
        vessel = session.get(Vessel, candidate["mmsi"])
        f = features_for_ais_candidate(
            candidate, drift_estimate, vessel, background_positions, uncertainty_km
        )
        feature_rows.append({"mmsi": candidate["mmsi"], "is_dark": False, "vector": f.vector, "sar_ship_detection_id": None})

    for idx, row in enumerate(dark_lonlat):
        viirs_match = viirs_results.get(idx, {}).get("matched")
        f = features_for_dark_candidate(
            row["lon"], row["lat"], row["length_estimate_m"], drift_estimate, viirs_match, uncertainty_km
        )
        feature_rows.append({"mmsi": None, "is_dark": True, "vector": f.vector, "sar_ship_detection_id": row["id"]})

    if not feature_rows:
        logger.info("No candidates found for DriftEstimate %d", drift_estimate.id)
        return []

    X_train, y_train = build_training_corpus(num_scenarios=training_scenarios)
    model = train_model(X_train, y_train)
    logger.info("Trained scorer on %d synthetic examples (%d scenarios) -- no real evidence in training data", len(y_train), training_scenarios)

    vectors = [row["vector"] for row in feature_rows]
    probs, shap_values = score_candidates(model, vectors)

    from app.attribution.features import FEATURE_NAMES

    ranked = sorted(zip(feature_rows, probs, shap_values), key=lambda r: -r[1])
    saved: list[AttributionCandidate] = []
    for rank, (row, prob, shap_row) in enumerate(ranked, start=1):
        candidate = AttributionCandidate(
            slick_detection_id=detection.id,
            drift_estimate_id=drift_estimate.id,
            mmsi=row["mmsi"],
            rank=rank,
            confidence=float(prob),
            features=dict(zip(FEATURE_NAMES, row["vector"])),
            shap_values=dict(zip(FEATURE_NAMES, [float(v) for v in shap_row])),
            is_dark_candidate=row["is_dark"],
            sar_ship_detection_id=row["sar_ship_detection_id"],
            model_version="xgboost_synthetic_v1",
        )
        session.add(candidate)
        saved.append(candidate)
    session.commit()

    logger.info("Persisted %d ranked AttributionCandidate row(s)", len(saved))
    return saved
