"""Read-only views over ingested data.

Ingestion itself is driven from the CLI (long, bandwidth-heavy, deliberate).
These endpoints exist so the map UI and the team can see what is actually
loaded — including which external sources are still unconfigured, since a
missing credential is the most common reason a stage has no data.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import AisPosition, Incident, SarScene

router = APIRouter(prefix="/api", tags=["catalogue"])


def _geojson(raw: str | None) -> dict | None:
    """ST_AsGeoJSON returns text; decode it so clients get real GeoJSON objects."""
    return json.loads(raw) if raw else None


@router.get("/sources")
def sources(db: Session = Depends(get_db)) -> dict:
    """Which external data sources are configured, and what has been ingested."""
    settings = get_settings()
    missing = settings.missing_credentials()

    by_source = db.execute(
        select(AisPosition.source, func.count(AisPosition.id)).group_by(
            AisPosition.source
        )
    ).all()

    return {
        "credentials": {
            "configured": sorted(
                {"cdse", "aisstream", "aishub", "cmems", "cds_era5"} - set(missing)
            ),
            "missing": missing,
        },
        "ingested": {
            "incidents": db.scalar(select(func.count(Incident.id))),
            "sar_scenes": db.scalar(select(func.count(SarScene.id))),
            "sar_scenes_downloaded": db.scalar(
                select(func.count(SarScene.id)).where(
                    SarScene.download_status == "complete"
                )
            ),
            "ais_positions": db.scalar(select(func.count(AisPosition.id))),
            "ais_by_source": {source: count for source, count in by_source},
        },
    }


@router.get("/incidents")
def list_incidents(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(
        select(
            Incident,
            func.ST_AsGeoJSON(Incident.center),
            func.ST_AsGeoJSON(Incident.aoi),
        ).order_by(Incident.occurred_at)
    ).all()

    return [
        {
            "slug": incident.slug,
            "name": incident.name,
            "occurred_at": incident.occurred_at.isoformat(),
            "validates": incident.validates,
            "center": _geojson(center),
            "aoi": _geojson(aoi),
        }
        for incident, center, aoi in rows
    ]


@router.get("/incidents/{slug}")
def get_incident(slug: str, db: Session = Depends(get_db)) -> dict:
    row = db.execute(
        select(
            Incident,
            func.ST_AsGeoJSON(Incident.center),
            func.ST_AsGeoJSON(Incident.aoi),
        ).where(Incident.slug == slug)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown incident {slug!r}")

    incident, center, aoi = row
    scenes = db.scalar(
        select(func.count(SarScene.id)).where(SarScene.incident_id == incident.id)
    )
    positions = db.scalar(
        select(func.count(AisPosition.id)).where(
            AisPosition.incident_id == incident.id
        )
    )

    return {
        "slug": incident.slug,
        "name": incident.name,
        "description": incident.description,
        "occurred_at": incident.occurred_at.isoformat(),
        "validates": incident.validates,
        "center": _geojson(center),
        "aoi": _geojson(aoi),
        # Ground truth is reference data, never pipeline output — surfaced so the
        # UI can show the known answer beside what the pipeline concluded.
        "ground_truth": incident.ground_truth,
        "sources": incident.sources,
        "ingested": {"sar_scenes": scenes, "ais_positions": positions},
    }
