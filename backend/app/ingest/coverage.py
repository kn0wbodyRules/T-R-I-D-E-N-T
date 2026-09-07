"""Empirical AIS coverage envelope.

The dark-vessel finding — "a radar-visible ship with no AIS" — is only
meaningful inside the area where AIS was actually being received. Terrestrial
receivers reach roughly 20-40 nautical miles offshore, so outside that envelope
the absence of AIS says nothing about the vessel and everything about the
sensor. Reporting such a vessel as "running dark" would be a false accusation
produced by a coverage hole.

Rather than hard-coding a nominal range ring, the envelope is derived from where
reports were *actually received* in the window being analysed. That adapts to
real receiver geometry, feed outages and regional differences, and it degrades
honestly: with no AIS at all, the envelope is empty and every dark-vessel claim
is correctly marked unverifiable instead of trivially true.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import SRID

# How tightly the hull wraps the observed points. 1.0 is a convex hull; lower
# values follow concavities more closely. 0.9 keeps the shape stable when
# reports are sparse while still not bridging large empty gaps.
DEFAULT_CONCAVITY = 0.9


@dataclass
class CoverageEnvelope:
    wkt: str | None
    position_count: int
    vessel_count: int
    window_start: datetime
    window_end: datetime

    @property
    def is_empty(self) -> bool:
        return self.wkt is None

    def describe(self) -> str:
        if self.is_empty:
            return (
                "No AIS reception in this window — dark-vessel findings cannot "
                "be distinguished from absent coverage."
            )
        return (
            f"AIS coverage derived from {self.position_count} reports "
            f"across {self.vessel_count} vessels."
        )


def coverage_envelope(
    session: Session,
    window_start: datetime,
    window_end: datetime,
    sources: tuple[str, ...] = ("aisstream", "aishub"),
    concavity: float = DEFAULT_CONCAVITY,
) -> CoverageEnvelope:
    """Build the envelope of AIS reception observed in a time window.

    Only live-feed sources count by default. Historical exports and tracks
    reconstructed from investigation reports cover exactly the vessels someone
    chose to include, so treating them as evidence of sensor coverage would
    describe an area where nothing was ever actually listening.
    """
    row = session.execute(
        text(
            """
            SELECT
                COUNT(*)                                  AS position_count,
                COUNT(DISTINCT mmsi)                      AS vessel_count,
                ST_AsText(
                    ST_ConcaveHull(ST_Collect(geom), :concavity)
                )                                         AS envelope
            FROM ais_positions
            WHERE ts >= :window_start
              AND ts <= :window_end
              AND source = ANY(:sources)
            """
        ),
        {
            "window_start": window_start,
            "window_end": window_end,
            "sources": list(sources),
            "concavity": concavity,
        },
    ).one()

    return CoverageEnvelope(
        wkt=row.envelope,
        position_count=row.position_count or 0,
        vessel_count=row.vessel_count or 0,
        window_start=window_start,
        window_end=window_end,
    )


def classify_absence(
    session: Session,
    lon: float,
    lat: float,
    envelope: CoverageEnvelope,
) -> str:
    """Say what "no AIS match here" actually means at this location.

    Returns one of:
      dark_vessel_candidate — inside coverage, so a genuine non-broadcast
      outside_ais_coverage  — no reception here; absence is uninformative
      coverage_unknown      — nothing received at all in the window
    """
    if envelope.is_empty:
        return "coverage_unknown"

    inside = session.execute(
        text(
            """
            SELECT ST_Contains(
                ST_GeomFromText(:envelope, :srid),
                ST_SetSRID(ST_MakePoint(:lon, :lat), :srid)
            )
            """
        ),
        {"envelope": envelope.wkt, "srid": SRID, "lon": lon, "lat": lat},
    ).scalar()

    return "dark_vessel_candidate" if inside else "outside_ais_coverage"
