from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SRID, Base, TimestampMixin


class Vessel(Base, TimestampMixin):
    """Vessel identity, keyed by MMSI.

    MMSI is the AIS broadcast identifier and is reassignable, so it is a weak
    identity anchor on its own — IMO number is the durable one. Both are kept:
    correlation joins on MMSI, while attribution reporting should prefer IMO
    plus name.
    """

    __tablename__ = "vessels"

    mmsi: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    imo: Mapped[int | None] = mapped_column(BigInteger, index=True)
    name: Mapped[str | None] = mapped_column(String(256))
    callsign: Mapped[str | None] = mapped_column(String(32))
    flag: Mapped[str | None] = mapped_column(String(64))
    vessel_type: Mapped[str | None] = mapped_column(String(64))
    length_m: Mapped[float | None] = mapped_column(Float)
    width_m: Mapped[float | None] = mapped_column(Float)

    # ais | equasis | manual — where these particulars came from, since AIS
    # self-reported fields are less trustworthy than a registry lookup.
    source: Mapped[str | None] = mapped_column(String(32))
    raw: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AisPosition(Base):
    """A single AIS position report.

    Highest-volume table in the schema — a busy strait produces millions of rows
    per incident window. Indexed for the two access patterns that matter:
    per-vessel track reconstruction (mmsi, ts) and the spatiotemporal intersect
    against a drift corridor (GiST on geom, BRIN on ts).

    Deliberately has no created_at: rows are bulk-loaded in the millions and the
    ingest timestamp carries no analytical value.
    """

    __tablename__ = "ais_positions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    mmsi: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    geom = mapped_column(Geometry("POINT", srid=SRID), nullable=False)

    sog: Mapped[float | None] = mapped_column(Float)  # speed over ground, knots
    cog: Mapped[float | None] = mapped_column(Float)  # course over ground, degrees
    heading: Mapped[float | None] = mapped_column(Float)
    nav_status: Mapped[str | None] = mapped_column(String(64))

    # aisstream | aishub | kpler | csv | reconstructed
    #
    # "reconstructed" marks tracks digitised from official investigation reports
    # rather than received from a live feed. Those are authoritative for the
    # historical demo incidents but are not raw sensor data, and any output
    # derived from them must say so.
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    incident_id: Mapped[int | None] = mapped_column(
        ForeignKey("incidents.id", ondelete="SET NULL")
    )

    __table_args__ = (
        # Same vessel, same instant, same feed is a duplicate — makes re-running
        # a loader idempotent.
        UniqueConstraint("mmsi", "ts", "source", name="uq_ais_positions_mmsi_ts_source"),
    )


Index("ix_ais_positions_mmsi_ts", AisPosition.mmsi, AisPosition.ts)
# GiST on geom is created by GeoAlchemy2 as idx_ais_positions_geom.
# BRIN rather than btree on ts: rows arrive in roughly chronological order, so a
# BRIN index is a fraction of the size at comparable selectivity for the range
# scans the corridor query does.
Index("ix_ais_positions_ts_brin", AisPosition.ts, postgresql_using="brin")
Index("ix_ais_positions_incident", AisPosition.incident_id)
