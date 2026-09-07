"""Stage 6a: which AIS-visible vessels were plausibly present in the
plausible origin region, at the time oil would actually have been there.

Two passes, for a real reason: a cheap PostGIS bounding check against the
corridor's overall spatial extent first (avoids scanning every vessel in the
window), then a precise per-position check against that instant's own
time-slice polygon -- exactly what DriftEstimate.corridor's own docstring
says it exists for, not just "anywhere in the final blob, any time."
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from shapely import wkt as shapely_wkt
from shapely.geometry import Point
from shapely.ops import unary_union
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import DriftEstimate


def find_ais_candidates(
    session: Session, drift_estimate: DriftEstimate, buffer_km: float,
) -> list[dict]:
    """Return one entry per MMSI whose track intersected the real,
    time-matched corridor, buffered by buffer_km -- computed fresh per run
    from this drift estimate's own ensemble spread (see
    uncertainty.search_radius_km), never a fixed constant tuned to one
    incident's known answer: {mmsi, positions: [{ts, lon, lat, sog, cog,
    heading, nav_status, source}, ...]}.
    """
    if not drift_estimate.corridor:
        raise ValueError(
            f"DriftEstimate {drift_estimate.id} has no corridor -- rerun "
            "analyze-detection with the corridor-building pipeline fix."
        )

    buffer_deg = buffer_km / 111.0  # adequate at this precision, same approximation used throughout this package
    slices = sorted(
        (
            (datetime.fromisoformat(c["t"]), shapely_wkt.loads(c["polygon"]).buffer(buffer_deg))
            for c in drift_estimate.corridor
        ),
        key=lambda s: s[0],
    )
    union_wkt = unary_union([poly for _, poly in slices]).wkt

    rows = session.execute(
        text(
            """
            SELECT mmsi, ts, ST_X(geom) AS lon, ST_Y(geom) AS lat,
                   sog, cog, heading, nav_status, source
            FROM ais_positions
            WHERE ts BETWEEN :window_start AND :window_end
              AND ST_Intersects(geom, ST_GeomFromText(:union_wkt, 4326))
            ORDER BY mmsi, ts
            """
        ),
        {
            "window_start": drift_estimate.window_start,
            "window_end": drift_estimate.window_end,
            "union_wkt": union_wkt,
        },
    ).mappings().all()

    by_mmsi: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        ts = row["ts"]
        if ts.tzinfo is not None:
            ts = ts.replace(tzinfo=None)
        # Nearest real time-slice to this ping -- corridor slices are one
        # per real OpenDrift output step (hourly), pings are denser, so this
        # is always a close match, not a coarse approximation.
        nearest_time, nearest_poly = min(slices, key=lambda s: abs((s[0] - ts).total_seconds()))
        point = Point(row["lon"], row["lat"])
        if nearest_poly.contains(point):
            by_mmsi[row["mmsi"]].append(dict(row))

    return [{"mmsi": mmsi, "positions": positions} for mmsi, positions in by_mmsi.items()]
