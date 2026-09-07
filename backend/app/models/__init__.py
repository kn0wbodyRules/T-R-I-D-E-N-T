"""SQLAlchemy models for the oil-spill detection and attribution pipeline.

Import order matters for Alembic autogenerate: every model must be imported
here so it is registered on Base.metadata before env.py reads it.
"""

from app.models.analysis import AttributionCandidate, DriftEstimate
from app.models.audit import EMBEDDING_DIM, EvidenceLog, IncidentEmbedding
from app.models.base import SRID, Base, TimestampMixin
from app.models.incident import Incident
from app.models.maritime import AisPosition, Vessel
from app.models.sar import SarScene, SarShipDetection, SceneScanLog, SlickDetection

__all__ = [
    "AisPosition",
    "AttributionCandidate",
    "Base",
    "DriftEstimate",
    "EMBEDDING_DIM",
    "EvidenceLog",
    "Incident",
    "IncidentEmbedding",
    "SRID",
    "SarScene",
    "SarShipDetection",
    "SceneScanLog",
    "SlickDetection",
    "TimestampMixin",
    "Vessel",
]
