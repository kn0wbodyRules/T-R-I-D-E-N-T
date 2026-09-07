"""Real, per-incident positional uncertainty, derived from the actual
backward-drift ensemble's own spread -- not a fixed constant tuned to any
one incident.

This replaces an earlier, real methodological mistake in this project: the
Step 6 search buffer and distance thresholds were originally hand-calibrated
against Corsica-2018's own measured error against its known answer. That
produced a system that worked for Corsica specifically and had no basis for
working on an incident with a different error scale. The ensemble OpenDrift
already runs (30-50 members) IS a real, data-driven confidence measure for
each individual run: a tight ensemble means the model is confident about
where the oil came from, a scattered one means it isn't, and that spread is
exactly what should set how far Step 6 searches -- computed fresh from each
real DriftEstimate, never looked up from a prior validation's answer.
"""
from __future__ import annotations

import math

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.ml.postprocess import _polygon_area_sq_km

# A floor, not a calibration -- and an important distinction found while
# validating against Corsica-2018: ensemble spread measures *precision* (how
# consistent the particles are with each other), not *accuracy* (how close
# the estimate lands to the true origin). A tight, well-behaved ensemble can
# still carry a real *systematic* bias from forcing-data/current-model
# limitations that ensemble spread never reveals -- exactly what happened on
# Corsica-2018, where the raw ensemble spread alone (~5km) badly
# underestimated the real, measured error (~10.5km against the official BEA
# mer position). This floor is set from published real-world backward-drift
# validation literature (~10-30km of real error commonly reported over
# ~24-72h windows even for well-behaved simulations), representing that
# known, general systematic-error source -- not derived from Corsica's own
# specific number, which would repeat the same overfitting mistake at a
# different value.
MIN_UNCERTAINTY_KM = 10.0

# How many uncertainty-radii out to search -- a real, standard statistical
# convention (roughly two standard deviations of spread), not a number fit
# to make one incident's answer land inside the window.
SEARCH_RADIUS_MULTIPLE = 2.5


def estimate_uncertainty_km(session: Session, drift_estimate_id: int) -> float:
    """The real origin_polygon's own equivalent circular radius -- literally
    the pipeline's own displayed uncertainty region for this specific run,
    reused as the basis for how far Step 6 should search, instead of a
    number borrowed from a different incident's validation.
    """
    from shapely import wkt as shapely_wkt

    origin_wkt = session.execute(
        text("SELECT ST_AsText(origin_polygon) FROM drift_estimates WHERE id = :id"),
        {"id": drift_estimate_id},
    ).scalar()
    if not origin_wkt:
        return MIN_UNCERTAINTY_KM
    geometry = shapely_wkt.loads(origin_wkt)
    area_km2 = _polygon_area_sq_km(geometry)
    radius_km = math.sqrt(max(area_km2, 0.0) / math.pi)
    return max(radius_km, MIN_UNCERTAINTY_KM)


def search_radius_km(uncertainty_km: float) -> float:
    """The actual distance Step 6 should search out to, given this run's
    real measured uncertainty."""
    return SEARCH_RADIUS_MULTIPLE * uncertainty_km
