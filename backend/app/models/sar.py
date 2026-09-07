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
    Boolean,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SRID, Base, TimestampMixin


class SarScene(Base, TimestampMixin):
    """A Sentinel-1 product: metadata in Postgres, pixels on disk.

    Rasters are hundreds of MB each, so only `local_path` lives here — the bytes
    stay on the data volume.
    """

    __tablename__ = "sar_scenes"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Provider's own product identifier (e.g. S1A_IW_GRDH_1SDV_2018...).
    # Unique so re-running a search never double-registers a scene.
    product_id: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)  # cdse | asf

    # CDSE publishes the same acquisition in more than one packaging (plain
    # .SAFE and Cloud-Optimized _COG.SAFE). They are not separate observations:
    # without distinguishing them, segmentation runs twice over identical pixels
    # and emits duplicate slicks. `acquisition_key` groups the variants;
    # `product_format` says which packaging this row is.
    acquisition_key: Mapped[str | None] = mapped_column(String(256))
    product_format: Mapped[str | None] = mapped_column(String(32))  # SAFE | COG
    mission: Mapped[str | None] = mapped_column(String(32))
    mode: Mapped[str | None] = mapped_column(String(32))  # IW, EW, SM
    polarisation: Mapped[str | None] = mapped_column(String(32))
    orbit_direction: Mapped[str | None] = mapped_column(String(32))

    acquired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    footprint = mapped_column(Geometry("POLYGON", srid=SRID), nullable=False)

    incident_id: Mapped[int | None] = mapped_column(
        ForeignKey("incidents.id", ondelete="SET NULL")
    )

    local_path: Mapped[str | None] = mapped_column(String(1024))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    download_status: Mapped[str] = mapped_column(
        String(32), default="pending", nullable=False
    )  # pending | downloading | complete | failed
    raw_metadata: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


# GiST indexes on geometry columns come from GeoAlchemy2's spatial_index
# default (idx_sar_scenes_footprint etc.); re-declaring them here would duplicate.
Index("ix_sar_scenes_acquired_at", SarScene.acquired_at)
Index("ix_sar_scenes_acquisition_key", SarScene.acquisition_key)
Index("ix_sar_scenes_incident", SarScene.incident_id)


class SlickDetection(Base, TimestampMixin):
    """An oil-slick polygon produced by the segmentation model (Stage 3).

    `detected_at` is the scene acquisition time — i.e. when the slick was
    *observed*, not when it was discharged. Recovering the discharge time and
    place is exactly what the drift backtracking in Stage 4 exists to do, so
    these two must never be conflated.
    """

    __tablename__ = "slick_detections"

    id: Mapped[int] = mapped_column(primary_key=True)
    scene_id: Mapped[int] = mapped_column(
        ForeignKey("sar_scenes.id", ondelete="CASCADE"), nullable=False
    )

    geom = mapped_column(Geometry("MULTIPOLYGON", srid=SRID), nullable=False)
    area_sq_km: Mapped[float | None] = mapped_column(Float)
    orientation_deg: Mapped[float | None] = mapped_column(Float)
    confidence: Mapped[float | None] = mapped_column(Float)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    model_version: Mapped[str | None] = mapped_column(String(64))

    # True when the scene's region is outside the training data's geographic
    # distribution (Mediterranean / Gulf of Mexico / Persian Gulf). Surfaced in
    # the UI so an out-of-domain detection is never presented with the same
    # confidence as an in-domain one.
    domain_gap_flag: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


Index("ix_slick_detections_scene", SlickDetection.scene_id)
Index("ix_slick_detections_detected_at", SlickDetection.detected_at)


class SceneScanLog(Base, TimestampMixin):
    """Record of every scene ever scanned, oil or not.

    This is the evidence Stage 3's temporal bounding depends on: a "clean"
    scan here is what lets a later detection be bounded to "at most N hours
    old" instead of an unhelpful worst-case guess. Without this table nothing
    upstream would ever record a clean pass, and a "we already looked here
    and saw nothing" fact would have no evidence to point to.
    """

    __tablename__ = "scene_scan_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    scene_id: Mapped[int] = mapped_column(
        ForeignKey("sar_scenes.id", ondelete="CASCADE"), nullable=False
    )
    region_id: Mapped[int | None] = mapped_column(
        ForeignKey("incidents.id", ondelete="SET NULL")
    )

    # Copied from the scene at scan time rather than joined through sar_scenes,
    # so Stage 3's ST_Intersects lookup doesn't need a join to work.
    scene_footprint = mapped_column(Geometry("POLYGON", srid=SRID), nullable=False)
    acquisition_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    oil_detected: Mapped[bool] = mapped_column(Boolean, nullable=False)
    detection_confidence: Mapped[float | None] = mapped_column(Float)
    scan_completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


Index("ix_scene_scan_log_region_time", SceneScanLog.region_id, SceneScanLog.acquisition_time)
Index("ix_scene_scan_log_scene", SceneScanLog.scene_id)


class SarShipDetection(Base, TimestampMixin):
    """A radar-bright ship blip from the same segmentation pass as the slick.

    The segmentation taxonomy already carries a "ship" class, so every scene
    yields vessel positions for free. Cross-referencing these against AIS at
    scene time is the dark-vessel check: a radar contact with no AIS match
    within `match_radius_m` is a vessel that was there but not broadcasting.
    """

    __tablename__ = "sar_ship_detections"

    id: Mapped[int] = mapped_column(primary_key=True)
    scene_id: Mapped[int] = mapped_column(
        ForeignKey("sar_scenes.id", ondelete="CASCADE"), nullable=False
    )

    geom = mapped_column(Geometry("POINT", srid=SRID), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    confidence: Mapped[float | None] = mapped_column(Float)
    length_estimate_m: Mapped[float | None] = mapped_column(Float)

    # Filled by the correlation step; NULL until it runs.
    matched_mmsi: Mapped[int | None] = mapped_column(BigInteger)
    match_distance_m: Mapped[float | None] = mapped_column(Float)
    is_dark: Mapped[bool | None] = mapped_column(Boolean)
    model_version: Mapped[str | None] = mapped_column(String(64))


Index("ix_sar_ship_detections_scene", SarShipDetection.scene_id)
Index("ix_sar_ship_detections_dark", SarShipDetection.is_dark)
