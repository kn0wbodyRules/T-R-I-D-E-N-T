"""Stage 4a: Evidence-Based Temporal Bounding.

Answers a narrower, provable question than "how old is this slick": "what is
the latest possible time this oil could have appeared, based on a real prior
scan of this exact water?" Guessing age from visual appearance has no
validated ground truth anywhere; a database lookup against a real prior
observation does.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import SlickDetection

# A visible surface slick does not coherently persist for anywhere near the
# 12-day satellite-revisit ceiling this project uses elsewhere (configured
# maximum below) -- wind, waves, evaporation and dispersion break up and
# weather a surface expression within roughly 1-3 days regardless of how long
# the underlying source has been active. This matters specifically for a
# chronic source (e.g. a decades-old leak): its *scan history* could
# legitimately chain back years, but the *visible patch* backward drift is
# meant to trace is never that old. Applied unconditionally, not just for
# known-chronic cases, since the physical limit doesn't stop applying just
# because a source happens to be discrete.
PHYSICAL_MAX_HOURS = 72

# Worst case when no usable prior scan exists at all: Sentinel-1's
# single-satellite orbital repeat cycle (see docs/architecture.md's Step 1
# supporting facts). A satellite-cadence number, not an oil-physics one --
# hence still subject to the physical cap above, which is almost always the
# tighter of the two.
CONFIGURED_MAX_HOURS = 288


def compute_temporal_bound(session: Session, detection: SlickDetection) -> dict:
    """Return the workflow's bound object: upper_bound_hours, bound_type,
    prior_scan_time, prior_scan_result, confidence, caveat."""
    geom_wkt = session.execute(
        text("SELECT ST_AsText(geom) FROM slick_detections WHERE id = :id"),
        {"id": detection.id},
    ).scalar()

    row = session.execute(
        text(
            """
            SELECT acquisition_time, oil_detected
            FROM scene_scan_log
            WHERE acquisition_time < :detected_at
              AND ST_Intersects(scene_footprint, ST_GeomFromText(:geom, 4326))
            ORDER BY acquisition_time DESC
            LIMIT 1
            """
        ),
        {"detected_at": detection.detected_at, "geom": geom_wkt},
    ).one_or_none()

    if row is None:
        raw_hours = CONFIGURED_MAX_HOURS
        result = {
            "bound_type": "configured_maximum",
            "prior_scan_time": None,
            "prior_scan_result": None,
            "confidence": "low",
            "caveat": "No prior scan of this location was found in scene_scan_log.",
        }
    else:
        prior_time: datetime = row.acquisition_time
        raw_hours = (detection.detected_at - prior_time).total_seconds() / 3600
        if row.oil_detected:
            result = {
                "bound_type": "evidence_based_prior_detection",
                "prior_scan_time": prior_time.isoformat(),
                "prior_scan_result": "oil_detected",
                "confidence": "low",
                "caveat": (
                    "The prior scan at this location also showed oil, so this "
                    "bound likely underestimates the true age of the source -- "
                    "treat as a rough reference, not a tight bound."
                ),
            }
        else:
            result = {
                "bound_type": "evidence_based",
                "prior_scan_time": prior_time.isoformat(),
                "prior_scan_result": "no_oil_detected",
                "confidence": "medium",
                "caveat": (
                    "Absence of detected oil in the prior scan does not "
                    "guarantee physical absence; detection model has known "
                    "limitations."
                ),
            }

    capped_hours = min(raw_hours, PHYSICAL_MAX_HOURS)
    if capped_hours < raw_hours:
        result["caveat"] = (
            result["caveat"]
            + f" Bound capped at {PHYSICAL_MAX_HOURS}h by surface-oil-persistence "
            "physics, not by scan history -- a visible slick does not survive "
            "coherently for as long as the raw scan gap would otherwise allow."
        )
    result["upper_bound_hours"] = round(capped_hours, 1)
    return result
