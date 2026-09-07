from datetime import datetime, timezone

import pytest

from app.ingest.cdse import (
    CdseCredentialsMissing,
    _footprint_wkt,
    build_filter,
    parse_product_identity,
)


class TestProductIdentity:
    """Packaging variants of one acquisition must collapse to a single key.

    CDSE returns the same observation as .SAFE and _COG.SAFE, and sometimes as
    several reprocessed copies with differing trailing CRCs. Treating those as
    distinct scenes makes Stage 3 segment identical pixels repeatedly and emit
    duplicate slicks for one patch of ocean.
    """

    def test_cog_and_safe_variants_share_an_acquisition_key(self):
        base = "S1B_IW_GRDH_1SDV_20181007T053511_20181007T053536_013042_01817B"
        safe_key, safe_format = parse_product_identity(f"{base}_5A05.SAFE")
        cog_key, cog_format = parse_product_identity(f"{base}_5624_COG.SAFE")

        assert safe_key == cog_key == base
        assert safe_format == "SAFE"
        assert cog_format == "COG"

    def test_reprocessed_copies_with_different_crcs_group_together(self):
        base = "S1B_IW_GRDH_1SDV_20181008T172145_20181008T172210_013064_01822C"
        keys = {
            parse_product_identity(f"{base}_{crc}.SAFE")[0]
            for crc in ("9C47", "B07F")
        }
        assert keys == {base}

    def test_different_acquisitions_do_not_collide(self):
        first, _ = parse_product_identity(
            "S1B_IW_GRDH_1SDV_20181007T053511_20181007T053536_013042_01817B_5A05.SAFE"
        )
        second, _ = parse_product_identity(
            "S1B_IW_GRDH_1SDV_20181007T053515_20181007T053540_013042_01817B_0AF0.SAFE"
        )
        assert first != second

    def test_unexpected_name_shape_falls_back_to_the_whole_name(self):
        # Better to under-group (process a scene twice) than to over-group and
        # silently discard a genuinely distinct observation.
        key, fmt = parse_product_identity("SOME_ODD_NAME.SAFE")
        assert key == "SOME_ODD_NAME"
        assert fmt == "SAFE"


class TestSearchFilter:
    def test_filter_includes_area_time_and_product_type(self):
        clause = build_filter(
            "POLYGON((8.5 42.7, 9.7 42.7, 9.7 43.6, 8.5 43.6, 8.5 42.7))",
            datetime(2018, 10, 5, tzinfo=timezone.utc),
            datetime(2018, 10, 17, tzinfo=timezone.utc),
        )
        assert "SENTINEL-1" in clause
        assert "OData.CSC.Intersects" in clause
        assert "SRID=4326" in clause
        assert "2018-10-05T00:00:00.000Z" in clause
        assert "GRD" in clause


class TestFootprintParsing:
    def test_reads_geojson_polygon(self):
        product = {
            "GeoFootprint": {
                "type": "Polygon",
                "coordinates": [[[8.5, 42.7], [9.7, 42.7], [9.7, 43.6], [8.5, 42.7]]],
            }
        }
        wkt = _footprint_wkt(product)
        assert wkt.startswith("POLYGON((8.5 42.7")

    def test_strips_the_geography_wrapper_from_wkt(self):
        product = {
            "Footprint": "geography'SRID=4326;POLYGON((8.5 42.7, 9.7 43.6, 8.5 42.7))'"
        }
        assert _footprint_wkt(product).startswith("POLYGON((")

    def test_returns_none_when_no_geometry_present(self):
        # register_scenes skips these rather than storing a scene that can never
        # match a spatial query.
        assert _footprint_wkt({"Name": "no-geometry"}) is None


def test_download_requires_credentials(monkeypatch):
    """Search is public, but download is authenticated — fail with a next step."""
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("CDSE_CLIENT_ID", "")
    monkeypatch.setenv("CDSE_CLIENT_SECRET", "")

    from app.ingest.cdse import _require_credentials

    with pytest.raises(CdseCredentialsMissing) as excinfo:
        _require_credentials()
    assert "dataspace.copernicus.eu" in str(excinfo.value)
    get_settings.cache_clear()
