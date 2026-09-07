import pytest
from fastapi.testclient import TestClient

from app.ingest.incidents import INCIDENTS, aoi_to_wkt, center_to_wkt
from app.main import app

client = TestClient(app)


def test_aoi_bbox_becomes_a_closed_ring():
    wkt = aoi_to_wkt((8.5, 42.7, 9.7, 43.6))
    assert wkt.startswith("POLYGON((")
    coords = wkt[len("POLYGON((") : -2].split(", ")
    assert coords[0] == coords[-1], "ring must close"
    assert len(coords) == 5


def test_center_wkt_is_lon_lat_order():
    assert center_to_wkt((103.765, 1.275)) == "POINT(103.765 1.275)"


@pytest.mark.parametrize("spec", INCIDENTS, ids=lambda s: s["slug"])
def test_incident_center_lies_inside_its_aoi(spec):
    lon, lat = spec["center"]
    minlon, minlat, maxlon, maxlat = spec["aoi"]
    assert minlon <= lon <= maxlon
    assert minlat <= lat <= maxlat


@pytest.mark.parametrize("spec", INCIDENTS, ids=lambda s: s["slug"])
def test_vessel_identifiers_are_absent_rather_than_guessed(spec):
    """MMSI/IMO must be NULL until sourced from a registry.

    A plausible-looking but wrong identifier would attach this incident's ground
    truth to an unrelated real vessel, so an unsourced field has to stay empty
    and say where to get it.
    """
    for vessel in spec["ground_truth"]["vessels"]:
        if vessel.get("mmsi") is None or vessel.get("imo") is None:
            assert vessel.get("needs_sourcing"), (
                f"{vessel['name']} lacks identifiers but does not record how to "
                f"source them"
            )


@pytest.mark.parametrize("spec", INCIDENTS, ids=lambda s: s["slug"])
def test_every_incident_declares_what_it_validates(spec):
    assert spec["validates"], f"{spec['slug']} validates no pipeline stage"
    assert set(spec["validates"]) <= {"detection", "drift", "attribution"}


def test_incident_stages_cover_the_whole_pipeline():
    """Detection, drift and attribution each need at least one real reference case."""
    covered = {stage for spec in INCIDENTS for stage in spec["validates"]}
    assert covered == {"detection", "drift", "attribution"}


def test_incidents_endpoint_returns_decoded_geojson():
    response = client.get("/api/incidents")
    assert response.status_code == 200
    incidents = response.json()
    assert {i["slug"] for i in incidents} == {"corsica-2018", "singapore-2024"}
    for incident in incidents:
        assert incident["center"]["type"] == "Point"
        assert incident["aoi"]["type"] == "Polygon"


def test_unknown_incident_returns_404():
    assert client.get("/api/incidents/does-not-exist").status_code == 404


def test_sources_endpoint_reports_unconfigured_credentials():
    payload = client.get("/api/sources").json()
    assert "credentials" in payload
    assert isinstance(payload["credentials"]["missing"], list)
    assert payload["ingested"]["incidents"] == len(INCIDENTS)
