from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SRID, Base, TimestampMixin


class DriftEstimate(Base, TimestampMixin):
    """Where the oil plausibly came from, reconstructed by running drift backwards.

    Output of the OpenDrift backtracking ensemble (Stage 4). The headline result
    is `origin_polygon` — a probability-weighted *region*, not a point, because
    the current and wind fields forcing the model are themselves uncertain and a
    single backtracked coordinate would imply precision that does not exist.

    `corridor` holds the time-sliced version: a list of {t, polygon, weight}
    slices, so the AIS query can ask "was this vessel inside the plausible origin
    region *at the time the oil would have been there*" rather than merely
    intersecting a union polygon.
    """

    __tablename__ = "drift_estimates"

    id: Mapped[int] = mapped_column(primary_key=True)
    slick_detection_id: Mapped[int] = mapped_column(
        ForeignKey("slick_detections.id", ondelete="CASCADE"), nullable=False
    )

    method: Mapped[str] = mapped_column(
        String(64), default="opendrift-backtrack", nullable=False
    )
    backtrack_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    ensemble_size: Mapped[int | None] = mapped_column(Integer)

    origin_polygon = mapped_column(Geometry("MULTIPOLYGON", srid=SRID), nullable=False)
    origin_centroid = mapped_column(Geometry("POINT", srid=SRID))

    # Bounds of the plausible discharge window. Width is driven by the
    # Sentinel-1 revisit gap: a 12-day-old scene yields a far wider window than
    # a same-day one, and the UI shows this so the two are never read alike.
    window_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    window_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    corridor: Mapped[dict] = mapped_column(JSONB, default=list, nullable=False)
    # Which current/wind products forced this run, for reproducibility.
    forcing: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


# GiST on the geometry columns is created by GeoAlchemy2
# (idx_drift_estimates_origin_polygon / _origin_centroid).
Index("ix_drift_estimates_slick", DriftEstimate.slick_detection_id)


class AttributionCandidate(Base, TimestampMixin):
    """One candidate explanation for a slick, with a calibrated score.

    A slick yields a *ranked list*, not an answer. In a busy lane several
    vessels can plausibly account for the same slick, and collapsing that to a
    single name would manufacture certainty the evidence does not support.

    `mmsi` is nullable on purpose: when no AIS-active vessel explains the
    corridor, the row records a dark-vessel hypothesis (`is_dark_candidate`)
    instead of forcing a match to whichever vessel happened to be nearest.
    """

    __tablename__ = "attribution_candidates"

    id: Mapped[int] = mapped_column(primary_key=True)
    slick_detection_id: Mapped[int] = mapped_column(
        ForeignKey("slick_detections.id", ondelete="CASCADE"), nullable=False
    )
    drift_estimate_id: Mapped[int | None] = mapped_column(
        ForeignKey("drift_estimates.id", ondelete="SET NULL")
    )
    mmsi: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("vessels.mmsi", ondelete="SET NULL")
    )

    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    # Engineered inputs to the scoring model (corridor overlap, AIS-gap timing,
    # course/speed anomaly, vessel-type prior, ...).
    features: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # Per-feature SHAP contributions — what turns a bare score into a defensible
    # one. Feeds both the UI breakdown and the LLM report prompt.
    shap_values: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    is_dark_candidate: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    sar_ship_detection_id: Mapped[int | None] = mapped_column(
        ForeignKey("sar_ship_detections.id", ondelete="SET NULL")
    )
    model_version: Mapped[str | None] = mapped_column(String(64))


Index("ix_attribution_candidates_slick", AttributionCandidate.slick_detection_id)
Index("ix_attribution_candidates_mmsi", AttributionCandidate.mmsi)
