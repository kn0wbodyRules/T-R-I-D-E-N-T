"""Stage 8b: turn one Step-6 candidate (AIS-visible or dark) into the fixed
feature vector Stage 8's XGBoost model scores.

One function per candidate type, both producing the same FEATURE_NAMES
vector, so training (on synthetic scenarios) and real scoring can never
silently diverge in what a given index means.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

from app.attribution.clustering import cluster_deviation_score

FEATURE_NAMES = [
    "min_distance_to_corridor_km",
    "distance_to_corridor_over_uncertainty",
    "hours_before_window_end_at_closest_approach",
    "mean_speed_kn",
    "speed_std_kn",
    "heading_change_std_deg",
    "max_ais_gap_minutes",
    "vessel_type_risk",
    "vessel_length_m",
    "cluster_deviation_score",
    "is_dark",
    "viirs_corroborated",
    "dwell_fraction",
    "course_consistency",
]

# Must match uncertainty.MIN_UNCERTAINTY_KM exactly -- this is the same
# floor, just needed on this side too since uncertainty_km arrives here
# already computed. Kept as one named constant per module rather than a
# shared import to avoid a real circular-import risk (uncertainty.py doesn't
# need to depend on features.py), with this comment as the explicit link.
MIN_UNCERTAINTY_KM_FOR_NORMALISATION = 10.0


@dataclass
class CandidateFeatures:
    mmsi: int | None
    is_dark: bool
    vector: list[float]


def _vessel_type_risk(vessel_type) -> float:
    """Base risk prior by AIS ship-type code (ITU-R M.1371 ranges) -- a
    tanker or cargo ship is the plausible oil source far more often than a
    passenger vessel or fishing boat, all else equal. A prior, not a
    verdict: XGBoost weighs it against everything else, it does not decide
    alone."""
    try:
        code = int(vessel_type)
    except (TypeError, ValueError):
        return 0.5  # unknown type -- neither raised nor lowered
    if 80 <= code <= 89:
        return 0.9  # tanker
    if 70 <= code <= 79:
        return 0.7  # cargo (incl. ro-ro bucket)
    if 60 <= code <= 69:
        return 0.3  # passenger
    if 30 <= code <= 39:
        return 0.2  # fishing
    return 0.4


def _speed_stats(positions: list[dict]) -> tuple[float | None, float | None, float | None]:
    speeds = [p["sog"] for p in positions if p.get("sog") is not None]
    headings = [p.get("cog") or p.get("heading") for p in positions]
    headings = [h for h in headings if h is not None]

    mean_speed = sum(speeds) / len(speeds) if speeds else None
    speed_std = None
    if len(speeds) > 1:
        mean = mean_speed
        speed_std = math.sqrt(sum((s - mean) ** 2 for s in speeds) / len(speeds))

    heading_std = None
    if len(headings) > 1:
        # Circular values (0/360 are the same heading) -- a naive std on raw
        # degrees badly overstates variance for a track that crosses North.
        # Using the unwrapped delta between consecutive headings instead.
        deltas = []
        for a, b in zip(headings, headings[1:]):
            d = (b - a + 180) % 360 - 180
            deltas.append(d)
        mean_d = sum(deltas) / len(deltas)
        heading_std = math.sqrt(sum((d - mean_d) ** 2 for d in deltas) / len(deltas))

    return mean_speed, speed_std, heading_std


def _max_ais_gap_minutes(positions: list[dict]) -> float | None:
    if len(positions) < 2:
        return None
    times = sorted(p["ts"] for p in positions)
    gaps = [(b - a).total_seconds() / 60.0 for a, b in zip(times, times[1:])]
    return max(gaps)


def _bearing_deg(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    d_lon = math.radians(lon2 - lon1)
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    x = math.sin(d_lon) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(d_lon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _sorted_slices(corridor: list[dict]):
    from shapely import wkt as shapely_wkt

    return sorted(
        ((datetime.fromisoformat(c["t"]), shapely_wkt.loads(c["polygon"])) for c in corridor),
        key=lambda s: s[0],
    )


def _dwell_fraction(positions: list[dict], slices: list) -> float:
    """Fraction of this vessel's own real position reports that fall inside
    the corridor's own time-matched (unbuffered) slice -- not just whether
    its single closest instant happens to overlap.

    Fixes a real blind spot found validating against Corsica-2018: a
    stationary source vessel's distance to the corridor barely changes
    across the whole window, so "the one closest instant" is close to
    arbitrary for it -- dwell fraction correctly reads as ~1.0 for a vessel
    that was there the entire time regardless of whether it ever moved. It
    also directly penalises a passer-by that only clips a *buffered* search
    radius at one moment: the buffer widens who gets searched (Step 6), but
    dwell is computed against the real, unbuffered corridor, so a fleeting
    coincidental overlap scores near 0 here even though it passed the
    inclusion gate.
    """
    from shapely.geometry import Point

    if not positions or not slices:
        return 0.0
    inside = 0
    for p in positions:
        ts = p["ts"].replace(tzinfo=None) if p["ts"].tzinfo else p["ts"]
        _, nearest_poly = min(slices, key=lambda s: abs((s[0] - ts).total_seconds()))
        if nearest_poly.contains(Point(p["lon"], p["lat"])):
            inside += 1
    return inside / len(positions)


def _course_consistency(positions: list[dict], slices: list) -> float:
    """At this vessel's real closest approach, how well its own reported
    course points toward the corridor at that instant -- 1.0 = heading
    straight at it (real evidence of intent/motion toward the incident, not
    just spatial overlap), 0.0 = heading straight away, 0.5 = no usable
    course report (neither confirms nor denies). A vessel actually involved
    in a collision is, almost by definition, heading toward the collision
    point at the time -- this is what actually distinguishes a striking
    vessel from a bystander on a similar stretch of water, which raw
    distance alone cannot.
    """
    from shapely.geometry import Point

    if not positions or not slices:
        return 0.5
    # Find the true closest approach first, regardless of whether that exact
    # ping has a course report -- searching for "any position with a course"
    # instead would silently swap in a worse (further) position just because
    # it happened to carry a COG value.
    best_km, best_position, best_bearing = float("inf"), None, None
    for p in positions:
        ts = p["ts"].replace(tzinfo=None) if p["ts"].tzinfo else p["ts"]
        _, nearest_poly = min(slices, key=lambda s: abs((s[0] - ts).total_seconds()))
        point = Point(p["lon"], p["lat"])
        distance_km = point.distance(nearest_poly) * 111.0
        if distance_km < best_km:
            centroid = nearest_poly.centroid
            best_km = distance_km
            best_position = p
            best_bearing = _bearing_deg(p["lon"], p["lat"], centroid.x, centroid.y)
    course = (best_position.get("cog") or best_position.get("heading")) if best_position else None
    if course is None:
        return 0.5
    angle_diff = abs((course - best_bearing + 180) % 360 - 180)
    return 1.0 - (angle_diff / 180.0)


def _closest_approach(
    positions: list[dict], corridor: list[dict], window_end: datetime,
) -> tuple[float, float]:
    """(min_distance_km to the corridor's own polygons, hours-before-window-
    end at that closest instant) -- real geometry, not just centroid
    distance, since the corridor's whole point is per-instant shape."""
    from shapely import wkt as shapely_wkt
    from shapely.geometry import Point

    slices = sorted(
        ((datetime.fromisoformat(c["t"]), shapely_wkt.loads(c["polygon"])) for c in corridor),
        key=lambda s: s[0],
    )
    best_km, best_hours = float("inf"), 0.0
    for p in positions:
        ts = p["ts"]
        if ts.tzinfo is not None:
            ts = ts.replace(tzinfo=None)
        nearest_t, nearest_poly = min(slices, key=lambda s: abs((s[0] - ts).total_seconds()))
        point = Point(p["lon"], p["lat"])
        distance_km = point.distance(nearest_poly) * 111.0  # degrees->km, adequate at this precision
        if distance_km < best_km:
            best_km = distance_km
            best_hours = max(0.0, (window_end.replace(tzinfo=None) - ts).total_seconds() / 3600.0)
    return best_km, best_hours


def features_for_ais_candidate(
    candidate: dict,  # {mmsi, positions: [{ts, lon, lat, sog, cog, heading, ...}]}
    drift_estimate,
    vessel,  # Vessel row or None
    background_positions: list[tuple[datetime, float, float]],
    uncertainty_km: float,
) -> CandidateFeatures:
    positions = candidate["positions"]
    slices = _sorted_slices(drift_estimate.corridor)
    min_dist_km, hours_before = _closest_approach(
        positions, drift_estimate.corridor, drift_estimate.window_end
    )
    # Scale-invariant companion to the raw km figure: "how many
    # uncertainty-radii away is this candidate" generalises across incidents
    # with very different real drift-model uncertainty, where the raw km
    # number alone does not (see uncertainty.py's module docstring for why
    # this replaced a fixed, incident-specific search radius).
    distance_ratio = min_dist_km / max(uncertainty_km, MIN_UNCERTAINTY_KM_FOR_NORMALISATION)
    dwell_fraction = _dwell_fraction(positions, slices)
    course_consistency = _course_consistency(positions, slices)
    mean_speed, speed_std, heading_std = _speed_stats(positions)
    max_gap = _max_ais_gap_minutes(positions)
    # Real AIS rows carry tz-aware timestamps; background_positions (see
    # pipeline._load_background_positions) are already stripped to naive --
    # mixing the two crashes datetime subtraction inside clustering's
    # distance matrix.
    candidate_track = [
        (p["ts"].replace(tzinfo=None) if p["ts"].tzinfo else p["ts"], p["lon"], p["lat"])
        for p in positions
    ]
    deviation = cluster_deviation_score(candidate_track, background_positions)

    vector = [
        min_dist_km, distance_ratio, hours_before, mean_speed or 0.0, speed_std or 0.0,
        heading_std or 0.0, max_gap or 0.0,
        _vessel_type_risk(vessel.vessel_type if vessel else None),
        vessel.length_m if vessel and vessel.length_m else 0.0,
        deviation, 0.0,  # is_dark
        0.5,  # viirs_corroborated -- not applicable to a visible AIS vessel
        dwell_fraction, course_consistency,
    ]
    return CandidateFeatures(mmsi=candidate["mmsi"], is_dark=False, vector=vector)


def features_for_dark_candidate(
    ship_lon: float, ship_lat: float, ship_length_m: float | None,
    drift_estimate, viirs_matched: bool | None, uncertainty_km: float,
) -> CandidateFeatures:
    from shapely import wkt as shapely_wkt
    from shapely.geometry import Point

    slices = [
        (datetime.fromisoformat(c["t"]), shapely_wkt.loads(c["polygon"]))
        for c in drift_estimate.corridor
    ]
    point = Point(ship_lon, ship_lat)
    min_dist_km = min(point.distance(poly) * 111.0 for _, poly in slices) if slices else float("inf")
    distance_ratio = min_dist_km / max(uncertainty_km, MIN_UNCERTAINTY_KM_FOR_NORMALISATION)

    viirs_feature = 0.5 if viirs_matched is None else (1.0 if viirs_matched else 0.0)
    vector = [
        min_dist_km, distance_ratio, 0.0, 0.0, 0.0, 0.0, 0.0,
        0.6,  # dark contacts get a moderate default type-risk -- type unknown without AIS
        ship_length_m or 0.0,
        0.5,  # no track history for a single-scene contact -- clustering not applicable
        1.0,  # is_dark
        viirs_feature,
        0.5,  # dwell_fraction -- a single SAR snapshot has no track to measure presence over
        0.5,  # course_consistency -- no course report for a radar-only contact
    ]
    return CandidateFeatures(mmsi=None, is_dark=True, vector=vector)
