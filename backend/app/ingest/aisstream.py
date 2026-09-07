"""AISStream.io live AIS listener.

Coverage caveat that must survive into the UI: AISStream is fed by *terrestrial*
receivers, so reception is roughly 20-40 nautical miles from shore. Beyond that
the absence of AIS reports means "not received", not "no vessel present" — and
conflating the two is exactly how a system invents a dark-vessel finding that is
really just a coverage hole. `app.ingest.coverage` derives the observed envelope
so downstream stages can tell the difference.

This is a live feed only; it cannot backfill. Historical windows for the demo
incidents come through `ais_csv` instead.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from datetime import datetime, timezone

import websockets
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import SRID, AisPosition

logger = logging.getLogger(__name__)

STREAM_URL = "wss://stream.aisstream.io/v0/stream"
FLUSH_INTERVAL_SECONDS = 5.0
FLUSH_SIZE = 500


class AisStreamCredentialsMissing(RuntimeError):
    pass


def _subscription(bbox: tuple[float, float, float, float], api_key: str) -> str:
    """Build the subscribe frame.

    AISStream expects [[south, west], [north, east]] — latitude first, which is
    the opposite order from the (lon, lat) convention used everywhere else in
    this codebase, so the swap happens here and nowhere else.
    """
    minlon, minlat, maxlon, maxlat = bbox
    return json.dumps(
        {
            "APIKey": api_key,
            "BoundingBoxes": [[[minlat, minlon], [maxlat, maxlon]]],
            "FilterMessageTypes": ["PositionReport"],
        }
    )


def _parse_position(payload: dict) -> dict | None:
    if payload.get("MessageType") != "PositionReport":
        return None

    metadata = payload.get("MetaData") or {}
    report = (payload.get("Message") or {}).get("PositionReport") or {}

    mmsi = metadata.get("MMSI") or report.get("UserID")
    lat = report.get("Latitude", metadata.get("latitude"))
    lon = report.get("Longitude", metadata.get("longitude"))
    if mmsi is None or lat is None or lon is None:
        return None
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None

    raw_ts = metadata.get("time_utc")
    ts = datetime.now(timezone.utc)
    if raw_ts:
        with contextlib.suppress(ValueError):
            # Feed sends e.g. "2026-08-30 12:00:00.000000000 +0000 UTC";
            # trim to something fromisoformat accepts.
            cleaned = raw_ts.replace(" UTC", "").strip()
            if "+" in cleaned:
                head, _, tail = cleaned.rpartition("+")
                cleaned = f"{head.strip()[:26]}+{tail}"
            ts = datetime.fromisoformat(cleaned)

    return {
        "mmsi": int(mmsi),
        "ts": ts,
        "geom": f"SRID={SRID};POINT({lon} {lat})",
        "sog": report.get("Sog"),
        "cog": report.get("Cog"),
        "heading": report.get("TrueHeading"),
        "nav_status": str(report.get("NavigationalStatus"))
        if report.get("NavigationalStatus") is not None
        else None,
        "source": "aisstream",
        "incident_id": None,
    }


def _flush(session: Session, batch: list[dict]) -> int:
    if not batch:
        return 0
    stmt = insert(AisPosition).values(batch)
    stmt = stmt.on_conflict_do_nothing(
        constraint="uq_ais_positions_mmsi_ts_source"
    ).returning(AisPosition.id)
    # See ais_csv._flush: rowcount is -1 on the multi-values path, so count the
    # RETURNING rows instead.
    inserted = len(session.execute(stmt).scalars().all())
    session.commit()
    batch.clear()
    return inserted


async def listen(
    bbox: tuple[float, float, float, float],
    duration_seconds: float | None = None,
) -> dict[str, int]:
    """Stream positions for a bounding box into ais_positions.

    Runs until `duration_seconds` elapses, or indefinitely when None.
    """
    settings = get_settings()
    if not settings.aisstream_api_key:
        raise AisStreamCredentialsMissing(
            "AISSTREAM_API_KEY is not set. Get a free key at https://aisstream.io/."
        )

    stats = {"received": 0, "inserted": 0}
    batch: list[dict] = []
    deadline = (
        asyncio.get_running_loop().time() + duration_seconds
        if duration_seconds
        else None
    )
    session = SessionLocal()
    last_flush = asyncio.get_running_loop().time()

    try:
        async with websockets.connect(STREAM_URL) as socket:
            await socket.send(_subscription(bbox, settings.aisstream_api_key))
            logger.info("Subscribed to AISStream for bbox %s", bbox)

            while True:
                now = asyncio.get_running_loop().time()
                if deadline and now >= deadline:
                    break

                timeout = 1.0 if deadline is None else min(1.0, deadline - now)
                try:
                    raw = await asyncio.wait_for(socket.recv(), timeout=timeout)
                except asyncio.TimeoutError:
                    if batch and now - last_flush >= FLUSH_INTERVAL_SECONDS:
                        stats["inserted"] += _flush(session, batch)
                        last_flush = now
                    continue

                try:
                    parsed = _parse_position(json.loads(raw))
                except (json.JSONDecodeError, ValueError, TypeError):
                    continue
                if parsed is None:
                    continue

                stats["received"] += 1
                batch.append(parsed)

                if len(batch) >= FLUSH_SIZE:
                    stats["inserted"] += _flush(session, batch)
                    last_flush = now

        stats["inserted"] += _flush(session, batch)
    finally:
        session.close()

    return stats
