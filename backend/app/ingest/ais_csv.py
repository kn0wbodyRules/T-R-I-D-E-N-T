"""Bulk loader for historical AIS position files.

Providers disagree on column naming (Kpler, MarineTraffic, MarineCadastre and
hand-digitised tracks all differ), so the loader resolves columns through an
alias table rather than assuming one schema.

Rows are inserted in batches with ON CONFLICT DO NOTHING against the
(mmsi, ts, source) constraint, which makes a re-run after a partial load resume
cleanly instead of duplicating.
"""

from __future__ import annotations

import csv
import logging
from collections.abc import Iterable, Iterator
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import SRID, AisPosition, Vessel

logger = logging.getLogger(__name__)

BATCH_SIZE = 5_000

# Lowercased header -> canonical field. Extend as new providers appear.
COLUMN_ALIASES: dict[str, str] = {
    "mmsi": "mmsi",
    "userid": "mmsi",
    "user_id": "mmsi",
    "ts": "ts",
    "timestamp": "ts",
    "basedatetime": "ts",
    "datetime": "ts",
    "time": "ts",
    "lat": "lat",
    "latitude": "lat",
    "y": "lat",
    "lon": "lon",
    "long": "lon",
    "longitude": "lon",
    "x": "lon",
    "sog": "sog",
    "speed": "sog",
    "speedoverground": "sog",
    "cog": "cog",
    "course": "cog",
    "courseoverground": "cog",
    "heading": "heading",
    "trueheading": "heading",
    "navstat": "nav_status",
    "navigationalstatus": "nav_status",
    "status": "nav_status",
    # Vessel static particulars -- not part of AisPosition, but real
    # MarineCadastre files carry them per-row, and Vessel already has columns
    # for exactly these (see maritime.py). Collected separately in iter_rows
    # and upserted into `vessels`, not silently discarded.
    "vesselname": "vessel_name",
    "imo": "imo",
    "callsign": "call_sign",
    "vesseltype": "vessel_type",
    "length": "length",
    "width": "width",
}

REQUIRED = {"mmsi", "ts", "lat", "lon"}
VESSEL_STATIC_FIELDS = {"vessel_name", "imo", "call_sign", "vessel_type", "length", "width"}


class AisCsvError(ValueError):
    """Raised when a file cannot be interpreted as AIS positions."""


def _normalise_header(name: str) -> str:
    # Real providers vary between "BaseDateTime", "base_date_time" and
    # "Base Date Time" for the same field -- strip both separators, not just
    # spaces, so all three resolve to the one alias key. Found the hard way:
    # a real MarineCadastre export uses underscores and the alias table
    # originally only stripped spaces, silently failing "missing column: ts"
    # on a genuine, correctly-formatted file.
    return name.strip().lower().replace(" ", "").replace("_", "")


def resolve_columns(header: Iterable[str]) -> dict[str, str]:
    """Map this file's headers onto canonical field names."""
    mapping: dict[str, str] = {}
    for column in header:
        canonical = COLUMN_ALIASES.get(_normalise_header(column))
        if canonical and canonical not in mapping.values():
            mapping[column] = canonical

    missing = REQUIRED - set(mapping.values())
    if missing:
        raise AisCsvError(
            f"AIS file is missing required column(s): {sorted(missing)}. "
            f"Saw headers: {sorted(header)}. Add an alias in COLUMN_ALIASES if "
            f"this provider names them differently."
        )
    return mapping


def _parse_timestamp(raw: str) -> datetime:
    text = raw.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%d/%m/%Y %H:%M:%S"):
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
        else:
            raise AisCsvError(f"Unrecognised timestamp format: {raw!r}") from None

    # AIS timestamps are UTC; a naive value means the provider omitted the
    # marker, not that it is local time.
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _to_float(raw: str | None) -> float | None:
    if raw is None or raw.strip() == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _vessel_static(row: dict, mmsi: int, source: str) -> dict | None:
    """Extract this row's vessel particulars, if any are present.

    Returns None when the row carries no static fields at all (most position
    pings after the first from a given vessel), so callers can skip an empty
    upsert rather than write a Vessel row with everything null.
    """
    imo_raw = (row.get("imo") or "").strip()
    length_raw = _to_float(row.get("length"))
    width_raw = _to_float(row.get("width"))
    fields = {
        "imo": int(float(imo_raw)) if imo_raw and imo_raw != "0" else None,
        "name": (row.get("vessel_name") or "").strip() or None,
        "callsign": (row.get("call_sign") or "").strip() or None,
        "vessel_type": (row.get("vessel_type") or "").strip() or None,
        "length_m": length_raw if length_raw else None,
        "width_m": width_raw if width_raw else None,
    }
    if not any(fields.values()):
        return None
    return {"mmsi": mmsi, "source": source, **fields}


def iter_rows(
    path: Path, source: str, incident_id: int | None
) -> Iterator[tuple[dict, dict | None]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise AisCsvError(f"{path} appears to be empty")
        mapping = resolve_columns(reader.fieldnames)

        for line_no, raw_row in enumerate(reader, start=2):
            row = {
                canonical: raw_row.get(column)
                for column, canonical in mapping.items()
            }

            lat = _to_float(row.get("lat"))
            lon = _to_float(row.get("lon"))
            if lat is None or lon is None:
                continue
            # Out-of-range coordinates are a known AIS defect (unset fields
            # broadcast as sentinels like 91/181). Dropping them here keeps
            # impossible positions out of the spatial index.
            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                logger.debug("Line %d: coordinates out of range, skipped", line_no)
                continue

            mmsi_raw = (row.get("mmsi") or "").strip()
            if not mmsi_raw:
                continue
            try:
                mmsi = int(float(mmsi_raw))
            except ValueError:
                continue

            position = {
                "mmsi": mmsi,
                "ts": _parse_timestamp(row["ts"]),
                "geom": f"SRID={SRID};POINT({lon} {lat})",
                "sog": _to_float(row.get("sog")),
                "cog": _to_float(row.get("cog")),
                "heading": _to_float(row.get("heading")),
                "nav_status": (row.get("nav_status") or None),
                "source": source,
                "incident_id": incident_id,
            }
            yield position, _vessel_static(row, mmsi, source)


def load_ais_csv(
    session: Session,
    path: Path,
    source: str,
    incident_id: int | None = None,
) -> dict[str, int]:
    """Load one AIS CSV into ais_positions, and vessel particulars into vessels.

    `source` should record provenance honestly — in particular "reconstructed"
    for tracks digitised from investigation reports, which are authoritative but
    are not raw sensor data.
    """
    stats = {"read": 0, "inserted": 0}
    batch: list[dict] = []
    # Keyed on mmsi so a busy vessel's many pings collapse to one upsert
    # instead of one per row -- static particulars rarely change mid-file.
    vessel_statics: dict[int, dict] = {}

    def flush() -> None:
        if not batch:
            return
        stmt = insert(AisPosition).values(batch)
        stmt = stmt.on_conflict_do_nothing(
            constraint="uq_ais_positions_mmsi_ts_source"
        ).returning(AisPosition.id)
        # RETURNING yields only rows that actually inserted, so conflicts are
        # excluded. rowcount is unreliable here: the driver reports -1 for the
        # multi-values path, which silently corrupts the duplicate count.
        stats["inserted"] += len(session.execute(stmt).scalars().all())
        session.commit()
        batch.clear()

    def flush_vessels() -> None:
        if not vessel_statics:
            return
        stmt = insert(Vessel).values(list(vessel_statics.values()))
        update_cols = {"imo", "name", "callsign", "vessel_type", "length_m", "width_m"}
        # COALESCE onto the existing row: a later, blanker ping must not
        # overwrite particulars a fuller earlier one already established, and
        # a real registry lookup (source="equasis") must not be clobbered by
        # a plain AIS re-load.
        stmt = stmt.on_conflict_do_update(
            index_elements=["mmsi"],
            set_={
                col: func.coalesce(getattr(Vessel, col), stmt.excluded[col])
                for col in update_cols
            },
        )
        session.execute(stmt)
        session.commit()
        vessel_statics.clear()

    for position, vessel_static in iter_rows(path, source, incident_id):
        batch.append(position)
        stats["read"] += 1
        if vessel_static is not None:
            vessel_statics[vessel_static["mmsi"]] = vessel_static
        if len(batch) >= BATCH_SIZE:
            flush()
        if len(vessel_statics) >= BATCH_SIZE:
            flush_vessels()
    flush()
    flush_vessels()

    stats["duplicates_skipped"] = stats["read"] - stats["inserted"]
    return stats
