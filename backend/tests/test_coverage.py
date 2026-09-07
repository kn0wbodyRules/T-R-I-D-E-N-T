"""Coverage-envelope behaviour, exercised against the real PostGIS instance.

These are integration tests: ST_ConcaveHull and ST_Contains are the logic under
test, so stubbing the database would test nothing that matters.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.db import SessionLocal
from app.ingest.coverage import classify_absence, coverage_envelope

WINDOW_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
WINDOW_END = WINDOW_START + timedelta(days=1)
TEST_SOURCE = "pytest-live"


@pytest.fixture
def session():
    with SessionLocal() as session:
        yield session
        session.execute(
            text("DELETE FROM ais_positions WHERE source = :src"),
            {"src": TEST_SOURCE},
        )
        session.commit()


def insert_positions(session, points, source=TEST_SOURCE):
    for index, (lon, lat) in enumerate(points):
        session.execute(
            text(
                """
                INSERT INTO ais_positions (mmsi, ts, geom, source)
                VALUES (
                    :mmsi, :ts,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                    :source
                )
                ON CONFLICT DO NOTHING
                """
            ),
            {
                "mmsi": 999100000 + index,
                "ts": WINDOW_START + timedelta(minutes=index),
                "lon": lon,
                "lat": lat,
                "source": source,
            },
        )
    session.commit()


def test_envelope_is_empty_without_reception(session):
    envelope = coverage_envelope(
        session, WINDOW_START, WINDOW_END, sources=(TEST_SOURCE,)
    )
    assert envelope.is_empty
    assert envelope.position_count == 0


def test_envelope_is_built_from_received_positions(session):
    insert_positions(
        session,
        [(103.70, 1.24), (103.80, 1.24), (103.80, 1.32), (103.70, 1.32), (103.75, 1.28)],
    )
    envelope = coverage_envelope(
        session, WINDOW_START, WINDOW_END, sources=(TEST_SOURCE,)
    )
    assert not envelope.is_empty
    assert envelope.position_count == 5
    assert envelope.vessel_count == 5
    assert "POLYGON" in envelope.wkt


def test_absence_inside_coverage_is_a_dark_vessel_candidate(session):
    insert_positions(
        session,
        [(103.70, 1.24), (103.80, 1.24), (103.80, 1.32), (103.70, 1.32)],
    )
    envelope = coverage_envelope(
        session, WINDOW_START, WINDOW_END, sources=(TEST_SOURCE,)
    )
    assert classify_absence(session, 103.75, 1.28, envelope) == "dark_vessel_candidate"


def test_absence_outside_coverage_is_not_called_dark(session):
    # The core guard: a vessel far offshore, where terrestrial AIS never reached,
    # must not be reported as running dark just because no report exists.
    insert_positions(
        session,
        [(103.70, 1.24), (103.80, 1.24), (103.80, 1.32), (103.70, 1.32)],
    )
    envelope = coverage_envelope(
        session, WINDOW_START, WINDOW_END, sources=(TEST_SOURCE,)
    )
    assert classify_absence(session, 105.50, 2.90, envelope) == "outside_ais_coverage"


def test_absence_with_no_coverage_at_all_is_unknown(session):
    envelope = coverage_envelope(
        session, WINDOW_START, WINDOW_END, sources=(TEST_SOURCE,)
    )
    assert classify_absence(session, 103.75, 1.28, envelope) == "coverage_unknown"


def test_historical_sources_do_not_count_as_sensor_coverage(session):
    # Tracks digitised from an investigation report cover exactly the vessels
    # someone chose to include. Treating them as reception would fabricate
    # coverage over an area where nothing was ever listening.
    insert_positions(
        session,
        [(103.70, 1.24), (103.80, 1.24), (103.80, 1.32), (103.70, 1.32)],
        source="reconstructed",
    )
    envelope = coverage_envelope(
        session, WINDOW_START, WINDOW_END, sources=("aisstream", "aishub")
    )
    assert envelope.is_empty
    session.execute(text("DELETE FROM ais_positions WHERE source = 'reconstructed'"))
    session.commit()
