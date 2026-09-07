from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.ingest.ais_csv import AisCsvError, iter_rows, resolve_columns


def write_csv(tmp_path: Path, content: str) -> Path:
    path = tmp_path / "ais.csv"
    path.write_text(content, encoding="utf-8")
    return path


def test_resolves_marinecadastre_style_headers():
    mapping = resolve_columns(["MMSI", "BaseDateTime", "LAT", "LON", "SOG", "COG"])
    assert set(mapping.values()) >= {"mmsi", "ts", "lat", "lon", "sog", "cog"}


def test_resolves_lowercase_provider_headers():
    mapping = resolve_columns(["mmsi", "timestamp", "latitude", "longitude"])
    assert set(mapping.values()) == {"mmsi", "ts", "lat", "lon"}


def test_missing_required_column_is_rejected_with_actionable_error():
    # A file without position columns must fail loudly rather than loading rows
    # that can never satisfy a spatial query.
    with pytest.raises(AisCsvError) as excinfo:
        resolve_columns(["MMSI", "BaseDateTime", "SOG"])
    message = str(excinfo.value)
    assert "lat" in message and "lon" in message
    assert "COLUMN_ALIASES" in message


def test_parses_rows_and_builds_srid_qualified_geometry(tmp_path):
    path = write_csv(
        tmp_path,
        "MMSI,BaseDateTime,LAT,LON,SOG,COG\n"
        "123456789,2024-06-14T06:00:00Z,1.2750,103.7650,12.5,275.0\n",
    )
    rows = list(iter_rows(path, source="csv", incident_id=None))
    assert len(rows) == 1
    row = rows[0]
    assert row["mmsi"] == 123456789
    assert row["ts"] == datetime(2024, 6, 14, 6, 0, tzinfo=timezone.utc)
    # Longitude precedes latitude in WKT — the opposite of the CSV column order,
    # which is the easiest thing in this pipeline to get silently backwards.
    assert row["geom"] == "SRID=4326;POINT(103.765 1.275)"
    assert row["sog"] == 12.5


def test_naive_timestamps_are_treated_as_utc(tmp_path):
    path = write_csv(
        tmp_path,
        "MMSI,BaseDateTime,LAT,LON\n123456789,2018-10-07 06:00:00,43.15,9.10\n",
    )
    row = next(iter_rows(path, source="csv", incident_id=None))
    assert row["ts"] == datetime(2018, 10, 7, 6, 0, tzinfo=timezone.utc)


def test_out_of_range_sentinel_coordinates_are_dropped(tmp_path):
    # 91/181 are the AIS "not available" sentinels; they are real values in real
    # feeds and would otherwise land in the spatial index as impossible points.
    path = write_csv(
        tmp_path,
        "MMSI,BaseDateTime,LAT,LON\n"
        "111111111,2024-06-14T06:00:00Z,91.0,181.0\n"
        "222222222,2024-06-14T06:01:00Z,1.275,103.765\n",
    )
    rows = list(iter_rows(path, source="csv", incident_id=None))
    assert [r["mmsi"] for r in rows] == [222222222]


def test_rows_without_mmsi_are_skipped(tmp_path):
    path = write_csv(
        tmp_path,
        "MMSI,BaseDateTime,LAT,LON\n"
        ",2024-06-14T06:00:00Z,1.275,103.765\n"
        "222222222,2024-06-14T06:01:00Z,1.276,103.766\n",
    )
    rows = list(iter_rows(path, source="csv", incident_id=None))
    assert [r["mmsi"] for r in rows] == [222222222]


def test_source_provenance_is_carried_onto_every_row(tmp_path):
    # "reconstructed" marks tracks digitised from investigation reports; the tag
    # must survive ingestion so downstream output can disclose it.
    path = write_csv(
        tmp_path,
        "MMSI,BaseDateTime,LAT,LON\n123456789,2018-10-07T06:00:00Z,43.15,9.10\n",
    )
    row = next(iter_rows(path, source="reconstructed", incident_id=7))
    assert row["source"] == "reconstructed"
    assert row["incident_id"] == 7
