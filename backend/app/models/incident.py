from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SRID, Base, TimestampMixin


class Incident(Base, TimestampMixin):
    """A documented real-world spill used as ground truth.

    The pipeline is validated against real incidents rather than synthetic
    scenarios, so each row carries the public-record answer (which vessel was
    actually responsible) plus a citation, and `validates` records which stage
    that incident is the reference case for.
    """

    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    center = mapped_column(Geometry("POINT", srid=SRID), nullable=False)
    aoi = mapped_column(Geometry("POLYGON", srid=SRID), nullable=False)

    # Which pipeline stages this incident is the reference case for, e.g.
    # ["detection", "drift"] — see docs/architecture.md.
    validates: Mapped[dict] = mapped_column(JSONB, default=list, nullable=False)

    # Public-record answer: responsible vessel(s), their identifiers, and what
    # actually happened. Never inferred by the pipeline — this is the yardstick
    # the pipeline's own output gets measured against.
    ground_truth: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    sources: Mapped[dict] = mapped_column(JSONB, default=list, nullable=False)


# Geometry columns get their GiST index from GeoAlchemy2's spatial_index
# default (idx_incidents_aoi) — declaring one here too would create a duplicate.
Index("ix_incidents_occurred_at", Incident.occurred_at)
