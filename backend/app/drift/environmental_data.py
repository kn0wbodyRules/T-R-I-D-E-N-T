"""Stage 5a: bulk-download real ocean current and wind forcing, once per
incident, cached locally -- not per-particle, not per-hour.

Uses username/key passed directly per call rather than a stored credentials
file (~/.cdsapirc or CMEMS's own login cache), which is fragile inside a
container and unnecessary when the values are already in settings via .env.
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

CDS_API_URL = "https://cds.climate.copernicus.eu/api"

# Verified against the live CDS API during setup -- see the credential
# verification this was based on. Kept as a constant here rather than
# guessed fresh, since a wrong product id fails loudly rather than silently.
ERA5_DATASET = "reanalysis-era5-single-levels"

# Global multi-year wave reanalysis -- verified against CMEMS's own catalog
# (copernicusmarine.describe(product_id="GLOBAL_MULTIYEAR_WAV_001_032")),
# not guessed. Carries VSDX/VSDY (surface Stokes drift components), which
# ocean-current + wind-drag alone omit -- a real, often dominant mechanism
# for how a floating oil slick moves, found missing (falling back to zero)
# in the first real end-to-end backward-drift runs against Corsica-2018.
CMEMS_WAVE_DATASET_ID = "cmems_mod_glo_wav_my_0.2deg_PT3H-i"


def fetch_era5_wind(
    aoi_bounds: tuple[float, float, float, float],  # (north, west, south, east)
    start: datetime,
    end: datetime,
    out_path: Path,
) -> Path:
    """Hourly 10m wind components for the AOI and window. One bulk request,
    not one per hour -- CDS queues requests server-side regardless of size,
    so batching is strictly cheaper, not just tidier."""
    import cdsapi

    settings = get_settings()
    if out_path.exists():
        out_path.unlink()
    client = cdsapi.Client(url=CDS_API_URL, key=settings.cds_api_key)

    days = sorted({d.strftime("%d") for d in _date_range(start, end)})
    months = sorted({d.strftime("%m") for d in _date_range(start, end)})
    years = sorted({d.strftime("%Y") for d in _date_range(start, end)})

    client.retrieve(
        ERA5_DATASET,
        {
            "product_type": "reanalysis",
            "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
            "year": years,
            "month": months,
            "day": days,
            "time": [f"{h:02d}:00" for h in range(24)],
            "area": list(aoi_bounds),
            "format": "netcdf",
        },
        str(out_path),
    )
    logger.info("ERA5 wind saved to %s", out_path)
    return out_path


def fetch_cmems_currents(
    dataset_id: str,
    aoi_bounds: tuple[float, float, float, float],  # (north, west, south, east)
    start: datetime,
    end: datetime,
    out_path: Path,
) -> Path:
    """Surface current components for the AOI and window from a CMEMS
    physics product. dataset_id must be looked up in the CMEMS catalog for
    the target region -- not hardcoded here, since the right product differs
    by AOI (global vs. regional reanalysis/forecast coverage)."""
    import copernicusmarine

    settings = get_settings()
    north, west, south, east = aoi_bounds
    # Re-fetching to an existing filename can silently keep stale/partial
    # cached content instead of a clean overwrite (found empirically: a
    # rerun with a wider window returned fewer days than a fresh filename
    # did for the identical request) -- remove first so every call is a
    # real, full fetch.
    if out_path.exists():
        out_path.unlink()
    copernicusmarine.subset(
        dataset_id=dataset_id,
        variables=["uo", "vo"],
        minimum_longitude=west, maximum_longitude=east,
        minimum_latitude=south, maximum_latitude=north,
        start_datetime=start.isoformat(), end_datetime=end.isoformat(),
        output_filename=str(out_path.name),
        output_directory=str(out_path.parent),
        username=settings.cmems_username, password=settings.cmems_password,
    )
    logger.info("CMEMS currents saved to %s", out_path)
    return out_path


def fetch_cmems_waves(
    aoi_bounds: tuple[float, float, float, float],  # (north, west, south, east)
    start: datetime,
    end: datetime,
    out_path: Path,
) -> Path:
    """Surface Stokes drift components (VSDX/VSDY) for the AOI and window.

    Ocean currents plus basic wind drag omit wind-driven surface (Stokes)
    transport -- a real, often significant mechanism for how a floating oil
    slick moves, and the first real end-to-end backward-drift runs against
    Corsica-2018 fell back to zero for it (no wave reader was supplied),
    landing ~25km off the known collision point. Global reanalysis (not
    regional), since AOI can be anywhere -- same reasoning as the currents
    product choice.
    """
    import copernicusmarine

    settings = get_settings()
    north, west, south, east = aoi_bounds
    if out_path.exists():
        out_path.unlink()
    copernicusmarine.subset(
        dataset_id=CMEMS_WAVE_DATASET_ID,
        variables=["VSDX", "VSDY"],
        minimum_longitude=west, maximum_longitude=east,
        minimum_latitude=south, maximum_latitude=north,
        start_datetime=start.isoformat(), end_datetime=end.isoformat(),
        output_filename=str(out_path.name),
        output_directory=str(out_path.parent),
        username=settings.cmems_username, password=settings.cmems_password,
    )
    logger.info("CMEMS waves (Stokes drift) saved to %s", out_path)
    return out_path


def _date_range(start: datetime, end: datetime):
    from datetime import timedelta
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)
