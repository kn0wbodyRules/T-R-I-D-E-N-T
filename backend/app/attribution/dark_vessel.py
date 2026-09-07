"""Stage 6b: dark-vessel detection -- radar-bright point targets (ships) in
the same scene the oil detection already scanned, cross-checked against real
AIS to find vessels physically present but not broadcasting.

Uses a real CFAR (Constant False Alarm Rate) statistic: the same windowed
local-contrast z-score already built for oil detection (radiometric.py), at
the opposite extreme. Oil is a strong NEGATIVE local anomaly (darker than
surrounding sea); a ship is a strong POSITIVE one (a small, very bright point
return against sea clutter). This is classical, industry-standard SAR ship
detection (used operationally, e.g. by coast guards), not a placeholder for
a future deep model -- xView3-SAR remains a documented upgrade path if this
project extends past the demo, not a requirement to reach a real result now.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.attribution.clustering import _haversine_km
from app.ml.radiometric import local_contrast_channels
from app.models import SRID, SarScene, SarShipDetection

logger = logging.getLogger(__name__)

DEFAULT_PIXEL_SIZE_M = 10.0
# Wider than oil's 15px contrast window: a ship point-target needs a bigger
# surrounding-sea sample so the target's own bright pixels don't bias their
# own local mean/std (which would suppress its own detectability).
DEFAULT_CFAR_WINDOW = 21

# Real, physically-motivated floor on the adaptive threshold below -- this
# project's own empirically measured local-contrast z-score bound from
# training-tile statistics (classes.py's Z_MAX: 99.9th percentile ~2.85,
# observed range roughly [-4.8, 5.7]), not a number fit to any one scene.
# Whatever a scene's own adaptive threshold computes to, never go below
# this, so an unusually flat/quiet scene doesn't fire on ordinary clutter.
MIN_Z_THRESHOLD = 4.0

# Real CFAR (Constant False Alarm Rate) means exactly this: the threshold
# adapts to each scene's own noise/clutter statistics to hold the false-
# alarm rate roughly constant, rather than one fixed global z-score fit to
# a single scene's ceiling. A previous version hardcoded 8.0 on an untested
# "10-20 sigma" assumption, which turned out to exceed the real maximum
# z-score anywhere in an entire real scene (6.18), silently zeroing out
# detection on real data -- then a second version hardcoded 5.0 from that
# one scene's own measurement, which is the same mistake at smaller scale.
# This value is a target OUTPUT COUNT (roughly how many candidate pixels a
# whole scene should surface), not a distance/answer-shaped number, so it
# doesn't carry the same overfitting risk -- but it is still a choice, and
# should be revisited if it proves wrong on a wider set of real scenes.
TARGET_FALSE_ALARM_PIXELS = 200

MIN_BLOB_PX = 2
MAX_BLOB_PX = 400  # beyond this it's a coastline/land artifact, not a ship

# Known, disclosed limitation: this scans the whole scene raster with no
# land mask. The segmentation model was only ever trained on sea/oil, so a
# land pixel's class prediction is meaningless noise either way -- masking
# by class_map would not actually solve this. A real coastline mask
# (reader_global_landmask's own data, already a dependency via OpenDrift,
# is the natural real source) would remove bright buildings/rock false
# positives near shore; not applied here, so candidates very close to the
# coastline should be treated with more scepticism than open-water ones.

DEFAULT_MATCH_RADIUS_M = 1000.0
DEFAULT_TIME_TOLERANCE_MIN = 15.0


@dataclass
class ShipCandidate:
    lon: float
    lat: float
    length_estimate_m: float
    peak_z_score: float


def _adaptive_z_threshold(z) -> float:
    """This scene's own real threshold, not a number borrowed from a
    different scene -- true CFAR: pick whatever z-score corresponds to
    roughly TARGET_FALSE_ALARM_PIXELS candidate pixels in *this* scene's own
    real distribution, floored at MIN_Z_THRESHOLD."""
    import numpy as np

    valid = z[np.isfinite(z)]
    if valid.size == 0:
        return MIN_Z_THRESHOLD
    target_percentile = 100.0 * (1 - TARGET_FALSE_ALARM_PIXELS / valid.size)
    threshold = float(np.percentile(valid, min(max(target_percentile, 0.0), 99.999)))
    return max(threshold, MIN_Z_THRESHOLD)


def detect_ships_cfar(
    backscatter_db,
    to_lonlat,
    window: int = DEFAULT_CFAR_WINDOW,
    z_threshold: float | None = None,
    pixel_size_m: float = DEFAULT_PIXEL_SIZE_M,
) -> tuple[list[ShipCandidate], float]:
    """backscatter_db: (H, W) calibrated VV dB, exactly
    inference.infer_scene's result.backscatter_db -- no second raster read
    needed when called from the same scan.

    z_threshold: pass None (the default) to compute it adaptively from this
    scene's own real distribution (see _adaptive_z_threshold) -- passing an
    explicit value is for testing/comparison only, not normal use, since a
    fixed value is exactly the per-scene overfitting this was built to avoid.

    Returns (candidates, z_threshold_used) -- the caller needs the actual
    threshold to compute a meaningful confidence score relative to it.
    """
    import cv2
    import numpy as np

    # local_contrast_channels expects a channel axis; backscatter_db is a
    # bare (H, W) VV array (see inference.py's InferenceResult), so add and
    # then drop a singleton channel dimension around the call.
    z = local_contrast_channels(backscatter_db[..., np.newaxis], window=window)[..., 0]

    if z_threshold is None:
        z_threshold = _adaptive_z_threshold(z)
        logger.info("CFAR: adaptive z-threshold %.2f for this scene", z_threshold)

    bright = (z > z_threshold).astype(np.uint8)
    if not bright.any():
        logger.info("CFAR: no bright-target candidates above z>%.2f", z_threshold)
        return [], z_threshold

    count, labels, stats, centroids = cv2.connectedComponentsWithStats(bright, connectivity=8)
    candidates: list[ShipCandidate] = []
    for label in range(1, count):
        area_px = int(stats[label, cv2.CC_STAT_AREA])
        if area_px < MIN_BLOB_PX or area_px > MAX_BLOB_PX:
            continue
        cx, cy = centroids[label]
        lon, lat = to_lonlat(np.array([cx]), np.array([cy]))
        length_px = max(stats[label, cv2.CC_STAT_WIDTH], stats[label, cv2.CC_STAT_HEIGHT])
        peak_z = float(z[labels == label].max())
        candidates.append(
            ShipCandidate(
                lon=float(lon[0]), lat=float(lat[0]),
                length_estimate_m=float(length_px * pixel_size_m),
                peak_z_score=peak_z,
            )
        )
    logger.info("CFAR: %d bright-target candidate(s) above z>%.2f", len(candidates), z_threshold)
    return candidates, z_threshold


def _cross_check_ais(
    session: Session, lon: float, lat: float, scene_time: datetime,
    match_radius_m: float, time_tolerance_min: float,
) -> tuple[int | None, float | None]:
    """Nearest real AIS position within radius+time tolerance, if any.

    ST_Distance on a geography cast gives real metres, not degrees -- a
    naive degree-based radius would be wildly wrong in latitude-dependent
    ways this project has already been careful about elsewhere (e.g. the
    equirectangular area-approximation caveat in postprocess.py).
    """
    t0 = scene_time - timedelta(minutes=time_tolerance_min)
    t1 = scene_time + timedelta(minutes=time_tolerance_min)
    row = session.execute(
        text(
            """
            SELECT mmsi,
                   ST_Distance(
                       geom::geography,
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                   ) AS dist_m
            FROM ais_positions
            WHERE ts BETWEEN :t0 AND :t1
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
            LIMIT 1
            """
        ),
        {"lon": lon, "lat": lat, "t0": t0, "t1": t1},
    ).mappings().first()
    if row is None or row["dist_m"] > match_radius_m:
        return None, None
    return int(row["mmsi"]), float(row["dist_m"])


def detect_and_persist(
    session: Session,
    scene: SarScene,
    backscatter_db,
    to_lonlat,
    model_version: str,
    reference_lon: float,
    reference_lat: float,
    max_distance_km: float,
    match_radius_m: float = DEFAULT_MATCH_RADIUS_M,
    time_tolerance_min: float = DEFAULT_TIME_TOLERANCE_MIN,
) -> list[SarShipDetection]:
    """Run CFAR, cross-check every candidate against real AIS at scene time,
    and persist as SarShipDetection rows -- is_dark=True where no AIS
    position was close enough in both space and time to explain the contact.

    reference_lon/lat + max_distance_km restrict candidates to a sensible
    radius around the incident -- a whole Sentinel-1 scene spans hundreds of
    km, and a ship on the far side of it isn't a plausible candidate
    regardless of incident. max_distance_km should come from
    uncertainty.search_radius_km (this run's own real ensemble spread), not
    a fixed constant -- required, not optional, so a caller can't
    accidentally fall back to scanning the whole scene at real-candidate
    scoring scale.
    """
    candidates, z_threshold_used = detect_ships_cfar(backscatter_db, to_lonlat)
    before = len(candidates)
    candidates = [
        c for c in candidates
        if _haversine_km(reference_lon, reference_lat, c.lon, c.lat) <= max_distance_km
    ]
    logger.info(
        "Restricted CFAR candidates to %.0fkm of the incident: %d -> %d",
        max_distance_km, before, len(candidates),
    )
    saved: list[SarShipDetection] = []
    for candidate in candidates:
        mmsi, distance_m = _cross_check_ais(
            session, candidate.lon, candidate.lat, scene.acquired_at,
            match_radius_m, time_tolerance_min,
        )
        row = SarShipDetection(
            scene_id=scene.id,
            geom=f"SRID={SRID};POINT({candidate.lon} {candidate.lat})",
            detected_at=scene.acquired_at,
            confidence=min(1.0, candidate.peak_z_score / (z_threshold_used * 2)),
            length_estimate_m=candidate.length_estimate_m,
            matched_mmsi=mmsi,
            match_distance_m=distance_m,
            is_dark=mmsi is None,
            model_version=model_version,
        )
        session.add(row)
        saved.append(row)
    session.commit()
    dark_count = sum(1 for r in saved if r.is_dark)
    logger.info(
        "Ship detections: %d total, %d AIS-matched, %d dark",
        len(saved), len(saved) - dark_count, dark_count,
    )
    return saved
