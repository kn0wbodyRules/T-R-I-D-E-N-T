"""Stage 3-5 orchestration: real detection -> real seed points -> real
backward drift -> real origin heatmap, persisted as one DriftEstimate row.

Each stage (temporal_bounds, seed_points, environmental_data,
opendrift_runner, heatmap) was already independently correct and verified
against real data. What was missing was wiring one real detection's real
geometry through all of them in order, instead of a hand-typed stand-in seed
point -- this module is that wiring, with nothing new invented in it.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from pathlib import Path

from shapely import wkt as shapely_wkt
from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.drift.environmental_data import (
    CMEMS_WAVE_DATASET_ID,
    fetch_cmems_currents,
    fetch_cmems_waves,
    fetch_era5_wind,
)
from app.drift.heatmap import build_origin_heatmap
from app.drift.opendrift_runner import run_backward_drift
from app.drift.seed_points import generate_seed_points
from app.drift.temporal_bounds import compute_temporal_bound
from app.models import SRID, DriftEstimate, SlickDetection

logger = logging.getLogger(__name__)

# Global multi-year reanalysis -- covers any historical date worldwide, but
# only at 0.083deg (~9km) and daily-mean resolution. Fallback for AOIs
# outside the regional product below. Looked up from CMEMS's own catalog,
# not guessed. A live, present-day detection would instead want a forecast/
# near-real-time product.
CMEMS_DATASET_ID_GLOBAL = "cmems_mod_glo_phy_my_0.083deg_P1D-m"

# Regional Mediterranean reanalysis at 4.2km, hourly -- verified real and
# covering Corsica-2018's date via a direct fetch, not assumed. A daily-mean
# global field cannot represent real coastal current variability at all;
# swapping to this for in-region AOIs was the concrete fix once the ~25km
# Corsica backward-drift error was diagnosed as a data-resolution problem,
# not a solver/numerical-method one (time_step, diffusivity were checked and
# ruled out first).
CMEMS_DATASET_ID_MEDITERRANEAN = "cmems_mod_med_phy-cur_my_4.2km_PT1H-m"

# Same Mediterranean bounding box already used elsewhere in this project
# (persist.py's IN_DOMAIN_BOUNDS) -- (min_lon, min_lat, max_lon, max_lat).
MEDITERRANEAN_BOUNDS = (-6.0, 30.0, 42.0, 46.0)


def _select_currents_dataset(aoi: tuple[float, float, float, float]) -> str:
    """aoi is (north, west, south, east); pick the regional product when the
    AOI center falls inside its real coverage, else the global fallback."""
    north, west, south, east = aoi
    center_lon, center_lat = (west + east) / 2, (south + north) / 2
    min_lon, min_lat, max_lon, max_lat = MEDITERRANEAN_BOUNDS
    if min_lon <= center_lon <= max_lon and min_lat <= center_lat <= max_lat:
        return CMEMS_DATASET_ID_MEDITERRANEAN
    return CMEMS_DATASET_ID_GLOBAL

# Degrees of margin around the seed points' own bounding box when fetching
# forcing data, so particles that drift outside that box during the
# simulation don't run out of current/wind coverage mid-run.
AOI_MARGIN_DEG = 1.0

ENSEMBLE_SIZE = 50


def _largest_polygon(geom) -> Polygon:
    if isinstance(geom, MultiPolygon):
        return max(geom.geoms, key=lambda g: g.area)
    return geom


# DriftEstimate.corridor's own docstring: "a list of {t, polygon, weight}
# slices, so the AIS query can ask 'was this vessel inside the plausible
# origin region at the time the oil would have been there' rather than
# merely intersecting a union polygon." Built here from OpenDrift's real
# per-timestep particle cloud (run_backward_drift's trajectory), not
# invented -- every slice is a real build_origin_heatmap call on that
# instant's real ensemble positions, same function used for the final blob.
def _build_corridor(
    trajectory: list[tuple[datetime, list[tuple[float, float]]]],
) -> list[dict]:
    corridor: list[dict] = []
    for ts, points in trajectory:
        if len(points) < 4:
            # Too few real particles at this instant for a meaningful
            # heatmap (build_origin_heatmap itself would just buffer a mean
            # point) -- skip rather than store a near-meaningless slice.
            continue
        polygon, _ = build_origin_heatmap(points)
        corridor.append({
            "t": ts.isoformat(),
            "polygon": polygon.wkt,
            "weight": len(points),  # real particle count at this instant
        })
    return corridor


def analyze_detection(
    session: Session,
    detection: SlickDetection,
    scenes_dir: Path = Path("/data/scenes"),
    ensemble_size: int = ENSEMBLE_SIZE,
) -> DriftEstimate:
    """Run Steps 3-5 for one real, already-persisted SlickDetection and
    persist the result as a DriftEstimate row."""
    bound = compute_temporal_bound(session, detection)
    logger.info(
        "Temporal bound: %.1fh (%s) — %s",
        bound["upper_bound_hours"], bound["bound_type"], bound["caveat"],
    )

    geom_wkt = session.execute(
        text("SELECT ST_AsText(geom) FROM slick_detections WHERE id = :id"),
        {"id": detection.id},
    ).scalar()
    polygon = _largest_polygon(shapely_wkt.loads(geom_wkt))

    seed_points = generate_seed_points(polygon)
    logger.info("Generated %d seed point(s) from the real detected polygon", len(seed_points))

    lons = [p.x for p in seed_points]
    lats = [p.y for p in seed_points]
    aoi = (
        max(lats) + AOI_MARGIN_DEG,  # north
        min(lons) - AOI_MARGIN_DEG,  # west
        min(lats) - AOI_MARGIN_DEG,  # south
        max(lons) + AOI_MARGIN_DEG,  # east
    )

    upper_bound_hours = bound["upper_bound_hours"]
    window_start = detection.detected_at - timedelta(hours=upper_bound_hours)
    # CMEMS's end_datetime behaves as an effectively-exclusive boundary in
    # practice (found empirically during setup) -- fetch well past the
    # detection time so the window reliably covers it. The daily-mean product
    # also needs real margin on the start side: with only ~24h between valid
    # timestamps, a thin buffer there starves the reader's interpolation
    # right as the backward run approaches window_start (found empirically --
    # a 6h buffer left OpenDrift 8h short of the full requested duration).
    fetch_start = window_start - timedelta(days=2)
    fetch_end = detection.detected_at + timedelta(days=1)

    scenes_dir.mkdir(parents=True, exist_ok=True)
    currents_path = scenes_dir / f"detection_{detection.id}_currents.nc"
    wind_path = scenes_dir / f"detection_{detection.id}_era5.nc"
    waves_path = scenes_dir / f"detection_{detection.id}_waves.nc"

    currents_dataset_id = _select_currents_dataset(aoi)
    logger.info(
        "Fetching CMEMS currents (%s) %s .. %s over %s",
        currents_dataset_id, fetch_start, fetch_end, aoi,
    )
    fetch_cmems_currents(currents_dataset_id, aoi, fetch_start, fetch_end, currents_path)
    logger.info("Fetching ERA5 wind %s .. %s over %s", fetch_start, fetch_end, aoi)
    fetch_era5_wind(aoi, fetch_start, fetch_end, wind_path)
    logger.info("Fetching CMEMS waves (Stokes drift) %s .. %s over %s", fetch_start, fetch_end, aoi)
    fetch_cmems_waves(aoi, fetch_start, fetch_end, waves_path)

    logger.info(
        "Running backward drift: %d seeds, %.1fh, ensemble=%d",
        len(seed_points), upper_bound_hours, ensemble_size,
    )
    drift_result = run_backward_drift(
        seed_points=seed_points,
        detection_time=detection.detected_at,
        upper_bound_hours=upper_bound_hours,
        currents_path=currents_path,
        wind_path=wind_path,
        waves_path=waves_path,
        ensemble_size=ensemble_size,
    )
    logger.info("%d ensemble endpoint(s)", len(drift_result.endpoints))

    origin_polygon, (centroid_lon, centroid_lat) = build_origin_heatmap(drift_result.endpoints)
    corridor = _build_corridor(drift_result.trajectory)

    estimate = DriftEstimate(
        slick_detection_id=detection.id,
        backtrack_hours=int(round(upper_bound_hours)),
        ensemble_size=ensemble_size,
        origin_polygon=f"SRID={SRID};{origin_polygon.wkt}",
        origin_centroid=f"SRID={SRID};POINT({centroid_lon} {centroid_lat})",
        window_start=window_start,
        window_end=detection.detected_at,
        corridor=corridor,
        forcing={
            "currents_dataset": currents_dataset_id,
            "wind_dataset": "reanalysis-era5-single-levels",
            "wave_dataset": CMEMS_WAVE_DATASET_ID,
            "fetch_window": [fetch_start.isoformat(), fetch_end.isoformat()],
            "temporal_bound": bound,
            "seed_point_count": len(seed_points),
        },
    )
    session.add(estimate)
    session.commit()
    logger.info(
        "DriftEstimate %d: origin centroid (%.4f, %.4f)",
        estimate.id, centroid_lon, centroid_lat,
    )
    return estimate
