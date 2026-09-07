from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# nomic-embed-text via Ollama. Fixed at DDL time because pgvector needs a
# declared dimension — changing embedding model means a migration, so this is
# recorded in EmbeddingChunk.model too.
EMBEDDING_DIM = 768


class EvidenceLog(Base):
    """Append-only, hash-chained record of what each pipeline stage did.

    Every stage writes its structured inputs and outputs here. Each entry hashes
    its own payload together with the previous entry's hash, so any later edit
    to a historical row breaks the chain and is detectable.

    The point is that an attribution claim can be replayed and audited after the
    fact — for a decision that could inform enforcement action, "the model said
    so" is not sufficient provenance.
    """

    __tablename__ = "evidence_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    stage: Mapped[str] = mapped_column(String(64), nullable=False)

    # What this entry is about, e.g. ("slick_detection", 42).
    subject_type: Mapped[str | None] = mapped_column(String(64))
    subject_id: Mapped[int | None] = mapped_column(BigInteger)

    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prev_hash: Mapped[str | None] = mapped_column(String(64))
    entry_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)


Index("ix_evidence_log_stage", EvidenceLog.stage)
Index("ix_evidence_log_subject", EvidenceLog.subject_type, EvidenceLog.subject_id)
Index("ix_evidence_log_ts", EvidenceLog.ts)


class IncidentEmbedding(Base):
    """Embedded text from past incident documentation, for similarity retrieval.

    Lets the report generator ground its narrative in comparable real cases
    (official investigation reports, ITOPF summaries, CleanSeaNet text) rather
    than writing from generic priors.
    """

    __tablename__ = "incident_embeddings"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int | None] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE")
    )

    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(1024))
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(Vector(EMBEDDING_DIM))
    model: Mapped[str | None] = mapped_column(String(64))
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


Index("ix_incident_embeddings_incident", IncidentEmbedding.incident_id)
# HNSW over cosine distance. Deliberately not created until the table has rows
# worth indexing — see the migration note; an empty HNSW index just adds write
# cost during bulk embedding.
Index(
    "ix_incident_embeddings_vec",
    IncidentEmbedding.embedding,
    postgresql_using="hnsw",
    postgresql_with={"m": 16, "ef_construction": 64},
    postgresql_ops={"embedding": "vector_cosine_ops"},
)
