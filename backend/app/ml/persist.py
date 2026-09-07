"""Writes inference output into the database.

Kept as a thin mapping layer so the ML modules stay database-agnostic and
testable without a session, and so every field the pipeline stores has one
obvious place to look for how it got there.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.ml.age_heuristic import estimate_age
from app.models import SRID, SarScene, SlickDetection

logger = logging.getLogger(__name__)

# Training data is Mediterranean, Gulf of Mexico and Persian Gulf. A scene
# outside those waters is out of distribution, and the detector's confidence
# there is not comparable to an in-domain scene — flagged per detection so the
# UI can say so rather than presenting both alike.
IN_DOMAIN_BOUNDS = (
    (-6.0, 30.0, 42.0, 46.0),    # Mediterranean
    (-98.0, 18.0, -80.0, 31.0),  # Gulf of Mexico
    (47.0, 23.0, 57.0, 31.0),    # Persian Gulf
)


def _is_in_domain(lon: float, lat: float) -> bool:
    return any(
        min_lon <= lon <= max_lon and min_lat <= lat <= max_lat
        for min_lon, min_lat, max_lon, max_lat in IN_DOMAIN_BOUNDS
    )


def save_detections(
    session: Session,
    scene: SarScene,
    result,
    candidates: list,
    wind_speed_ms: float | None = None,
) -> list[SlickDetection]:
    """Persist slick candidates as SlickDetection rows."""
    saved: list[SlickDetection] = []

    for candidate in candidates:
        centroid = candidate.geometry.centroid
        in_domain = _is_in_domain(centroid.x, centroid.y)

        age = estimate_age(
            geometry=candidate.geometry,
            pixel_geometry=candidate.pixel_geometry,
            slick_mask=candidate.pixel_mask,
            backscatter_db=result.backscatter_db,
            area_sq_km=candidate.area_sq_km,
            wind_speed_ms=wind_speed_ms,
        )

        detection = SlickDetection(
            scene_id=scene.id,
            geom=f"SRID={SRID};{candidate.geometry.wkt}",
            area_sq_km=candidate.area_sq_km,
            orientation_deg=candidate.orientation_deg,
            confidence=candidate.confidence,
            # Scene acquisition time — when the slick was *observed*, not when it
            # was discharged. Recovering the latter is exactly what Stage 4's
            # backtracking exists to do; conflating them is the mistake this
            # whole pipeline is built to avoid.
            detected_at=scene.acquired_at,
            model_version=result.model_version,
            domain_gap_flag=not in_domain,
            attributes={
                "age_estimate": age.to_dict(),
                "centroid": {"lon": centroid.x, "lat": centroid.y},
                "polarisations": result.stats.get("polarisations"),
                "scene_shape": list(result.shape),
            },
        )
        session.add(detection)
        saved.append(detection)

        logger.info(
            "Slick %.3f km2 at (%.4f, %.4f) — age %s (%s), domain_gap=%s",
            candidate.area_sq_km, centroid.x, centroid.y,
            age.band, age.confidence, not in_domain,
        )

    session.commit()
    return saved
