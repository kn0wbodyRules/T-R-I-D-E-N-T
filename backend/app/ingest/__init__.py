"""Data ingestion: external sources in, database rows out.

Each module here owns one source and is responsible for normalising it into the
schema. Loaders are written to be idempotent — re-running one must not duplicate
rows — because ingestion gets re-run constantly during development and partway
through failed downloads.
"""
