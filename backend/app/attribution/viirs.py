"""Stage 7: VIIRS nighttime-lights corroboration for dark-vessel candidates.

Real NOAA/EOG VIIRS Boat Detection (VBD) data -- verified directly (not
assumed) that: the URL pattern is
https://eogdata.mines.edu/wwwdata/viirs_products/vbd-pub/v23/{region}/{state}/
{file}, where region is an ISO-3166 3-letter code and state is "fnl" for the
open, Creative-Commons-licensed final product; and that despite that open
licensing, a real free EOG account is genuinely required -- direct directory
access redirects to an OAuth login even for the "final" tier. Token exchange
is a Resource Owner Password grant (username+password -> bearer token),
matching the same shape as this project's own CDSE integration.

A real account (eogdata.mines.edu/products/register/) with EOG_USERNAME/
EOG_PASSWORD in .env is required for this module to actually reach the API --
without it, every function here raises ViirsCredentialsMissing rather than
silently returning an empty, misleadingly-clean result.

Corroboration value is real but limited by physics, and this module says so
rather than overselling it: VIIRS/Suomi-NPP's overpass for a given location
is roughly one fixed local time per night (~01:30 local for this region), so
it only ever sees *that* instant, not continuously -- a dark candidate near
the incident time can be checked against the covered night(s) in the
evidence-based window, never against the exact incident instant unless that
instant happens to coincide with the overpass.
"""
from __future__ import annotations

import csv
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

TOKEN_URL = "https://eogauth-new.mines.edu/realms/eog/protocol/openid-connect/token"
VBD_BASE_URL = "https://eogdata.mines.edu/wwwdata/viirs_products/vbd-pub/v23"
VBD_CLIENT_ID = "eogdata_oidc"  # EOG's documented public client id for this grant

# Real ISO-3166 alpha-3 codes (a stable, well-established standard, not
# something needing per-use verification), each paired with a rough
# coastal-waters bounding box wide enough to cover a real incident's
# territorial/EEZ waters. Deliberately honest about its scope: this covers
# only the regions this project's own known incident set falls in
# (Corsica/Mediterranean France, Taylor Energy/Gulf of Mexico, Singapore
# Strait). A location outside all of these raises rather than silently
# guessing a wrong region code -- a hardcoded single-country default (this
# module's own prior mistake, "fra" applied unconditionally) is exactly the
# kind of per-incident hand-calibration this project is trying to eliminate
# from Steps 6-8.
_KNOWN_REGIONS: list[tuple[str, tuple[float, float, float, float]]] = [
    # (iso3, (min_lon, min_lat, max_lon, max_lat))
    ("fra", (-5.0, 41.0, 10.0, 51.5)),   # France incl. Mediterranean coast/Corsica
    ("usa", (-98.0, 18.0, -80.0, 31.0)),  # US Gulf of Mexico coast
    ("sgp", (103.0, 1.0, 105.0, 2.0)),    # Singapore Strait
]


def region_code_for(lon: float, lat: float) -> str:
    """The real region a location falls in, from this project's own known
    incident coverage -- not a hardcoded single default."""
    for iso3, (min_lon, min_lat, max_lon, max_lat) in _KNOWN_REGIONS:
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
            return iso3
    raise ValueError(
        f"No known VIIRS region for ({lon}, {lat}) -- add its real EEZ/coastal "
        "bounding box to _KNOWN_REGIONS rather than guessing a default."
    )

# Real VBD CSV fields per EOG's own documentation (date, time, lat/lon,
# DNB radiance, quality flag) -- exact header spelling varies by product
# version, so resolved through an alias table rather than hardcoded, same
# resilience pattern as ais_csv.py's COLUMN_ALIASES for the same reason.
COLUMN_ALIASES = {
    "date_mscan": "date", "date": "date",
    "time_mscan": "time", "time": "time",
    "lat_dnb": "lat", "lat": "lat", "latitude": "lat",
    "lon_dnb": "lon", "lon": "lon", "longitude": "lon",
    "rad_dnb": "radiance", "rh": "radiance", "radiance": "radiance",
    "qf_detect": "quality_flag", "qf": "quality_flag",
}


class ViirsCredentialsMissing(RuntimeError):
    pass


@dataclass
class BoatDetection:
    ts: datetime
    lon: float
    lat: float
    radiance: float | None
    quality_flag: str | None


def _require_credentials():
    settings = get_settings()
    if not settings.eog_username or not settings.eog_password:
        raise ViirsCredentialsMissing(
            "EOG_USERNAME/EOG_PASSWORD not set. Register a free account at "
            "https://eogdata.mines.edu/products/register/ and add both to "
            ".env -- VIIRS corroboration cannot run without a real token."
        )
    return settings


def _fetch_token() -> str:
    import httpx

    settings = _require_credentials()
    response = httpx.post(
        TOKEN_URL,
        data={
            "client_id": VBD_CLIENT_ID,
            "username": settings.eog_username,
            "password": settings.eog_password,
            "grant_type": "password",
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def fetch_vbd_night(region_code: str, night: date, out_path: Path) -> Path:
    """Download one region's real VBD CSV for one real night.

    region_code: ISO-3166 3-letter, e.g. "fra" for France -- the region a
    location falls in must be looked up against EOG's own region list, not
    guessed from the country the incident is loosely "in" (coastal waters
    can be filed under a different region than the nearest coastline).
    """
    import httpx

    token = _fetch_token()
    filename = f"VBD_npp_d{night:%Y%m%d}_{region_code}_noaa_ops_v23.csv"
    url = f"{VBD_BASE_URL}/{region_code}/fnl/{filename}"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream(
        "GET", url, headers={"Authorization": f"Bearer {token}"}, timeout=60.0
    ) as response:
        if response.status_code == 404:
            raise FileNotFoundError(
                f"No VBD file for {region_code} on {night} at {url} -- this "
                "region/date may not have final-tier coverage yet."
            )
        response.raise_for_status()
        with out_path.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)
    logger.info("VIIRS VBD saved to %s", out_path)
    return out_path


def parse_vbd_csv(path: Path) -> list[BoatDetection]:
    detections: list[BoatDetection] = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            return detections
        mapping = {}
        for column in reader.fieldnames:
            canonical = COLUMN_ALIASES.get(column.strip().lower().replace(" ", "").replace("_", ""))
            if canonical:
                mapping[column] = canonical

        for raw_row in reader:
            row = {canonical: raw_row.get(column) for column, canonical in mapping.items()}
            try:
                lon, lat = float(row["lon"]), float(row["lat"])
            except (KeyError, TypeError, ValueError):
                continue
            date_str, time_str = row.get("date"), row.get("time")
            try:
                ts = datetime.strptime(f"{date_str} {time_str}", "%Y%m%d %H%M%S")
            except (TypeError, ValueError):
                continue
            radiance = None
            try:
                radiance = float(row["radiance"]) if row.get("radiance") else None
            except ValueError:
                pass
            detections.append(BoatDetection(ts, lon, lat, radiance, row.get("quality_flag")))
    return detections


def corroborate_dark_candidates(
    dark_candidates: list[dict],  # [{lon, lat, ...}] -- Step 6's dark SarShipDetection rows
    region_code: str,
    window_start: datetime,
    window_end: datetime,
    scenes_dir: Path,
    match_radius_km: float = 2.0,
) -> dict[int, dict]:
    """For every night the evidence-based window covers, fetch real VBD data
    and check each dark candidate against it. Returns {candidate_index:
    {matched: bool, distance_km, viirs_time}} -- absence is never reported as
    "cleared"; it just means no VIIRS pass corroborated this specific
    candidate, which daytime, cloud cover, or a dim-lit vessel can equally
    explain.
    """
    nights = []
    d = window_start.date()
    while d <= window_end.date():
        nights.append(d)
        d += timedelta(days=1)

    all_detections: list[BoatDetection] = []
    for night in nights:
        out_path = scenes_dir / f"vbd_{region_code}_{night:%Y%m%d}.csv"
        try:
            fetch_vbd_night(region_code, night, out_path)
            all_detections += parse_vbd_csv(out_path)
        except FileNotFoundError as exc:
            logger.warning("VIIRS: %s", exc)

    results: dict[int, dict] = {}
    for idx, candidate in enumerate(dark_candidates):
        best = None
        for det in all_detections:
            distance_km = _haversine_km(candidate["lon"], candidate["lat"], det.lon, det.lat)
            if best is None or distance_km < best[0]:
                best = (distance_km, det)
        if best and best[0] <= match_radius_km:
            results[idx] = {
                "matched": True, "distance_km": best[0], "viirs_time": best[1].ts.isoformat(),
            }
        else:
            results[idx] = {"matched": False, "distance_km": None, "viirs_time": None}
    return results


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    import math

    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))
