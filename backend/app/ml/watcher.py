"""Per-scene scan-and-log: the one function both a backfill script and any
future continuous watcher call, so "scan everything, log clean or oil" is
implemented exactly once.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.ml import postprocess
from app.ml.inference import infer_scene
from app.ml.persist import save_detections
from app.models import SarScene, SceneScanLog

logger = logging.getLogger(__name__)


def scan_and_log(
    session: Session,
    scene: SarScene,
    scene_path: Path,
    checkpoint_path: Path,
    min_area_sq_km: float = 0.01,
    wind_speed_ms: float | None = None,
) -> SceneScanLog:
    """Run detection on one already-downloaded scene and write the evidence.

    Always writes a scene_scan_log row, oil or not -- that row is what Stage
    3's temporal bounding depends on existing. Only writes slick_detections
    rows (via the existing save_detections) when something survives cleanup.
    """
    result = infer_scene(scene_path, checkpoint_path)
    candidates = postprocess.extract_slicks(
        result.class_map, result.to_lonlat, min_area_sq_km=min_area_sq_km
    )

    oil_detected = len(candidates) > 0
    confidence = max((c.confidence for c in candidates), default=None)

    log_row = SceneScanLog(
        scene_id=scene.id,
        region_id=scene.incident_id,
        scene_footprint=scene.footprint,
        acquisition_time=scene.acquired_at,
        oil_detected=oil_detected,
        detection_confidence=confidence,
        scan_completed_at=datetime.now(timezone.utc),
    )
    session.add(log_row)

    if oil_detected:
        save_detections(session, scene, result, candidates, wind_speed_ms=wind_speed_ms)
    else:
        session.commit()

    logger.info(
        "Scanned %s: oil_detected=%s (%d candidate(s))",
        scene.product_id, oil_detected, len(candidates),
    )
    return log_row
