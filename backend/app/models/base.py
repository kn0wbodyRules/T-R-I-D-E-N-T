from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# All geometry is stored in WGS84 lat/lon, matching what AIS broadcasts and what
# Sentinel-1 footprints are published in. Anything needing metric units (areas,
# distances) is projected at query time rather than stored in a projected CRS,
# since the AOIs span multiple UTM zones.
SRID = 4326


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
