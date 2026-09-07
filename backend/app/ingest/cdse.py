"""Copernicus Data Space Ecosystem connector — Sentinel-1 scene search and download.

Search and registration are separated from download on purpose. A search returns
metadata in kilobytes and is safe to run freely; a download is roughly 1 GB per
GRD product. Registering scenes first means the catalogue can be reviewed, and a
specific scene chosen, before committing that bandwidth and disk.
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import SRID, SarScene

logger = logging.getLogger(__name__)

TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE"
    "/protocol/openid-connect/token"
)
CATALOGUE_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
DOWNLOAD_URL = "https://download.dataspace.copernicus.eu/odata/v1/Products({pid})/$value"


class CdseCredentialsMissing(RuntimeError):
    """Raised when a CDSE call is attempted without configured credentials."""


def _require_credentials() -> tuple[str, str]:
    settings = get_settings()
    if not settings.cdse_username or not settings.cdse_password:
        raise CdseCredentialsMissing(
            "CDSE_USERNAME and CDSE_PASSWORD are not set. Register at "
            "https://dataspace.copernicus.eu/ and add them to .env."
        )
    return settings.cdse_username, settings.cdse_password


async def get_access_token(client: httpx.AsyncClient | None = None) -> str:
    # The password grant against CDSE's public client, not client_credentials:
    # a Sentinel-Hub-style OAuth client (client_credentials) issues a token
    # that authenticates fine but is scoped to Sentinel Hub/openEO, not the
    # bulk-download OData API, which 401s on it regardless. This is CDSE's own
    # documented flow for the download endpoint specifically.
    username, password = _require_credentials()
    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=60)
    try:
        response = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "password",
                "client_id": "cdse-public",
                "username": username,
                "password": password,
            },
        )
        response.raise_for_status()
        return response.json()["access_token"]
    finally:
        if owns_client:
            await client.aclose()


def build_filter(
    aoi_wkt: str,
    start: datetime,
    end: datetime,
    product_type: str = "GRD",
    collection: str = "SENTINEL-1",
) -> str:
    """Compose the OData $filter for an area/time/product-type query."""
    # CDSE wants ISO-8601 with milliseconds and a literal Z.
    fmt = "%Y-%m-%dT%H:%M:%S.000Z"
    return (
        f"Collection/Name eq '{collection}'"
        f" and OData.CSC.Intersects(area=geography'SRID={SRID};{aoi_wkt}')"
        f" and ContentDate/Start gt {start.strftime(fmt)}"
        f" and ContentDate/Start lt {end.strftime(fmt)}"
        f" and contains(Name,'{product_type}')"
    )


async def search_scenes(
    aoi_wkt: str,
    start: datetime,
    end: datetime,
    product_type: str = "GRD",
    limit: int = 50,
) -> list[dict]:
    """Query the CDSE catalogue. Returns raw product dicts (no DB writes)."""
    params = {
        "$filter": build_filter(aoi_wkt, start, end, product_type),
        "$orderby": "ContentDate/Start asc",
        "$top": str(limit),
        "$expand": "Attributes",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.get(CATALOGUE_URL, params=params)
        response.raise_for_status()
        return response.json().get("value", [])


def _attribute(product: dict, name: str) -> str | None:
    for attr in product.get("Attributes") or []:
        if attr.get("Name") == name:
            value = attr.get("Value")
            return str(value) if value is not None else None
    return None


def _footprint_wkt(product: dict) -> str | None:
    """Pull a POLYGON WKT out of whichever geometry field the product carries.

    SarScene.footprint is declared as a plain POLYGON column, but CDSE
    sometimes returns a MULTIPOLYGON footprint (observed for coastal/complex
    coverage). Normalising through shapely rather than raw string slicing
    matters for two reasons: naive substring search for "POLYGON" also matches
    inside "MULTIPOLYGON" (stripping the "MULTI" prefix leaves one stray layer
    of parentheses, which Postgres then rejects outright as invalid geometry),
    and shapely's parser tolerates the whitespace CDSE's raw string sometimes
    carries ("POLYGON (((" vs "POLYGON(((") that a hand-rolled slice would not
    reliably clean up.
    """
    footprint = product.get("Footprint")
    candidate = None
    if isinstance(footprint, str):
        upper = footprint.upper()
        if "MULTIPOLYGON" in upper:
            idx = upper.index("MULTIPOLYGON")
        elif "POLYGON" in upper:
            idx = upper.index("POLYGON")
        else:
            idx = None
        if idx is not None:
            candidate = footprint[idx:].rstrip("'")

    if candidate is None:
        geo = product.get("GeoFootprint")
        if isinstance(geo, dict) and geo.get("type") == "Polygon":
            rings = geo.get("coordinates") or []
            if rings:
                coords = ", ".join(f"{lon} {lat}" for lon, lat in rings[0])
                candidate = f"POLYGON(({coords}))"

    if candidate is None:
        return None

    try:
        from shapely import wkt as shapely_wkt
        from shapely.geometry import MultiPolygon

        geom = shapely_wkt.loads(candidate)
        if isinstance(geom, MultiPolygon):
            # Keep the largest part rather than failing outright on a
            # genuinely multi-part footprint the column can't represent.
            geom = max(geom.geoms, key=lambda g: g.area)
        return geom.wkt
    except Exception:
        logger.warning("Could not parse footprint geometry, keeping raw candidate: %s", candidate[:80])
        return candidate


def parse_product_identity(product_id: str) -> tuple[str, str]:
    """Split a product name into (acquisition_key, product_format).

    Sentinel-1 names look like:
        S1B_IW_GRDH_1SDV_<start>_<stop>_<orbit>_<datatake>_<crc>[_COG].SAFE

    The trailing CRC differs between packagings of the same acquisition, so the
    key drops it along with the format marker. Anything that does not match the
    expected shape keeps its full name as the key, which degrades to today's
    behaviour rather than silently grouping unrelated scenes.
    """
    name = product_id
    for suffix in (".SAFE", ".zip"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]

    product_format = "SAFE"
    if name.endswith("_COG"):
        product_format = "COG"
        name = name[: -len("_COG")]

    parts = name.split("_")
    # Drop the trailing CRC only when the name has the full expected structure.
    if len(parts) >= 9:
        name = "_".join(parts[:-1])

    return name, product_format


def register_scenes(
    session: Session,
    products: list[dict],
    incident_id: int | None = None,
) -> dict[str, int]:
    """Upsert search results into sar_scenes as pending downloads.

    Keyed on the provider's product_id, so re-running a search over an
    overlapping window updates rather than duplicates.
    """
    counts = {"created": 0, "updated": 0, "skipped_no_footprint": 0}

    for product in products:
        product_id = product.get("Name") or product.get("Id")
        if not product_id:
            continue

        footprint = _footprint_wkt(product)
        if not footprint:
            # Without a footprint the scene cannot participate in any spatial
            # query, so registering it would create a row that silently never
            # matches. Skip loudly instead.
            counts["skipped_no_footprint"] += 1
            logger.warning("Skipping %s: no parsable footprint", product_id)
            continue

        scene = session.scalar(
            select(SarScene).where(SarScene.product_id == product_id)
        )
        if scene is None:
            scene = SarScene(product_id=product_id, source="cdse")
            session.add(scene)
            counts["created"] += 1
        else:
            counts["updated"] += 1

        started = product.get("ContentDate", {}).get("Start")
        if started:
            scene.acquired_at = datetime.fromisoformat(started.replace("Z", "+00:00"))

        scene.acquisition_key, scene.product_format = parse_product_identity(
            product_id
        )
        scene.footprint = f"SRID={SRID};{footprint}"
        scene.mission = _attribute(product, "platformShortName")
        scene.mode = _attribute(product, "operationalMode")
        scene.polarisation = _attribute(product, "polarisationChannels")
        scene.orbit_direction = _attribute(product, "orbitDirection")
        scene.size_bytes = product.get("ContentLength")
        scene.incident_id = incident_id
        scene.raw_metadata = {
            "id": product.get("Id"),
            "online": product.get("Online"),
            "publication_date": product.get("PublicationDate"),
        }

    session.commit()
    return counts


def distinct_acquisitions(
    session: Session,
    incident_id: int | None = None,
    prefer_format: str = "COG",
) -> list[SarScene]:
    """One scene per real acquisition, collapsing packaging variants.

    Stage 3 must iterate this rather than sar_scenes directly: the catalogue
    returns the same observation repackaged (and sometimes reprocessed) several
    times, and segmenting each copy would burn GPU time to produce duplicate
    slicks for one patch of ocean.

    COG is preferred because tiled inference reads windows out of the raster,
    which a Cloud-Optimized GeoTIFF supports without decompressing the whole
    product — the plain SAFE variant is the fallback when no COG exists.
    """
    query = select(SarScene)
    if incident_id is not None:
        query = query.where(SarScene.incident_id == incident_id)

    chosen: dict[str, SarScene] = {}
    for scene in session.scalars(query.order_by(SarScene.product_id)):
        key = scene.acquisition_key or scene.product_id
        current = chosen.get(key)
        if current is None:
            chosen[key] = scene
            continue
        # Prefer the requested packaging; otherwise keep the first seen so the
        # selection is deterministic across runs.
        if scene.product_format == prefer_format and current.product_format != prefer_format:
            chosen[key] = scene

    return sorted(chosen.values(), key=lambda s: (s.acquired_at, s.product_id))


# A ~1.75GB single-stream download over a real-world connection is long enough
# to hit a dropped connection well before it's done -- observed directly: one
# attempt got 49.9MB in before the peer closed the stream. Restarting from byte
# zero on every such hiccup would make a flaky connection nearly unable to ever
# finish, so failures are retried with an HTTP Range resume rather than
# discarding the partial file, up to this many attempts.
_MAX_DOWNLOAD_ATTEMPTS = 6

# Errors worth retrying with resume: transient network/connection failures.
# Anything else (auth, 4xx from the server) fails fast instead -- retrying a
# 401 six times wastes time on an error a resume can't fix.
_RETRYABLE_EXCEPTIONS = (
    httpx.RemoteProtocolError,
    httpx.ReadTimeout,
    httpx.ReadError,
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.PoolTimeout,
)


async def download_scene(session: Session, scene: SarScene) -> Path:
    """Stream one product to disk and mark it complete.

    Downloads to a .part file and renames on success. A partial file survives a
    retryable failure (see _RETRYABLE_EXCEPTIONS) so the next attempt resumes
    via Range instead of re-downloading what's already on disk; it's only
    discarded on a non-retryable error, where the bytes so far can't be trusted
    to mean what a resume would assume they mean.
    """
    settings = get_settings()

    target_dir = Path(settings.data_dir) / "scenes"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{scene.product_id}.zip"
    partial = target.with_suffix(".zip.part")

    product_uuid = (scene.raw_metadata or {}).get("id")
    if not product_uuid:
        raise ValueError(
            f"Scene {scene.product_id} has no CDSE product UUID; re-run the search."
        )

    scene.download_status = "downloading"
    session.commit()

    for attempt in range(1, _MAX_DOWNLOAD_ATTEMPTS + 1):
        token = await get_access_token()
        resume_from = partial.stat().st_size if partial.exists() else 0
        headers = {"Authorization": f"Bearer {token}"}
        if resume_from:
            headers["Range"] = f"bytes={resume_from}-"
            logger.info(
                "Resuming %s from byte %d (attempt %d/%d)",
                scene.product_id, resume_from, attempt, _MAX_DOWNLOAD_ATTEMPTS,
            )

        try:
            async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
                async with client.stream(
                    "GET", DOWNLOAD_URL.format(pid=product_uuid), headers=headers,
                ) as response:
                    if resume_from and response.status_code == 200:
                        # Server ignored the Range request and is sending the
                        # whole object again -- start the file over rather
                        # than appending a second full copy after the partial.
                        logger.warning(
                            "%s: server does not support resume; restarting from 0",
                            scene.product_id,
                        )
                        resume_from = 0
                    response.raise_for_status()
                    mode = "ab" if resume_from else "wb"
                    with partial.open(mode) as handle:
                        async for chunk in response.aiter_bytes(chunk_size=1 << 20):
                            handle.write(chunk)
            partial.rename(target)
            break
        except _RETRYABLE_EXCEPTIONS as exc:
            logger.warning(
                "%s: download attempt %d/%d failed (%s), %s",
                scene.product_id, attempt, _MAX_DOWNLOAD_ATTEMPTS, exc,
                "retrying" if attempt < _MAX_DOWNLOAD_ATTEMPTS else "giving up",
            )
            if attempt == _MAX_DOWNLOAD_ATTEMPTS:
                scene.download_status = "failed"
                session.commit()
                raise
        except Exception:
            scene.download_status = "failed"
            session.commit()
            partial.unlink(missing_ok=True)
            raise

    scene.local_path = str(target)
    scene.size_bytes = target.stat().st_size
    scene.download_status = "complete"
    session.commit()
    return target
