"""Read-only views over the full Steps 1-8 pipeline's stored output.

Same discipline as catalogue.py: the pipeline itself is driven from the CLI
(long-running, deliberately triggered -- detection, drift, and attribution
runs take real minutes and hit real external services), and these endpoints
exist purely to serve what's already been computed and persisted, for a
frontend to render. No endpoint here re-runs any stage.
"""
from __future__ import annotations

import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from shapely import wkt as shapely_wkt
from shapely.geometry import mapping
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    AisPosition,
    AttributionCandidate,
    DriftEstimate,
    Incident,
    SarScene,
    SarShipDetection,
    SlickDetection,
    Vessel,
)


def _incident_id_for_drift_estimate(db: Session, drift_estimate_id: int) -> int | None:
    return db.scalar(
        select(SarScene.incident_id)
        .select_from(DriftEstimate)
        .join(SlickDetection, DriftEstimate.slick_detection_id == SlickDetection.id)
        .join(SarScene, SlickDetection.scene_id == SarScene.id)
        .where(DriftEstimate.id == drift_estimate_id)
    )

router = APIRouter(prefix="/api", tags=["pipeline"])


def _geojson(raw: str | None) -> dict | None:
    return json.loads(raw) if raw else None


@router.get("/incidents/{slug}/detections")
def list_detections(slug: str, db: Session = Depends(get_db)) -> list[dict]:
    """Every real slick detection for scenes registered under this incident."""
    incident = db.scalar(select(Incident).where(Incident.slug == slug))
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Unknown incident {slug!r}")

    rows = db.execute(
        select(
            SlickDetection,
            SarScene.product_id,
            func.ST_AsGeoJSON(SlickDetection.geom),
        )
        .join(SarScene, SlickDetection.scene_id == SarScene.id)
        .where(SarScene.incident_id == incident.id)
        .order_by(SlickDetection.detected_at)
    ).all()

    return [
        {
            "id": detection.id,
            "scene_product_id": product_id,
            "detected_at": detection.detected_at.isoformat(),
            "area_sq_km": detection.area_sq_km,
            "confidence": detection.confidence,
            "model_version": detection.model_version,
            "domain_gap_flag": detection.domain_gap_flag,
            "geometry": _geojson(geom_geojson),
            "attributes": detection.attributes,
        }
        for detection, product_id, geom_geojson in rows
    ]


@router.get("/detections/{detection_id}")
def get_detection(detection_id: int, db: Session = Depends(get_db)) -> dict:
    row = db.execute(
        select(SlickDetection, SarScene.product_id, func.ST_AsGeoJSON(SlickDetection.geom))
        .join(SarScene, SlickDetection.scene_id == SarScene.id)
        .where(SlickDetection.id == detection_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"No detection {detection_id}")

    detection, product_id, geom_geojson = row
    drift_ids = db.execute(
        select(DriftEstimate.id).where(DriftEstimate.slick_detection_id == detection_id)
    ).scalars().all()

    return {
        "id": detection.id,
        "scene_product_id": product_id,
        "detected_at": detection.detected_at.isoformat(),
        "area_sq_km": detection.area_sq_km,
        "orientation_deg": detection.orientation_deg,
        "confidence": detection.confidence,
        "model_version": detection.model_version,
        "domain_gap_flag": detection.domain_gap_flag,
        "geometry": _geojson(geom_geojson),
        "attributes": detection.attributes,
        "drift_estimate_ids": drift_ids,
    }


@router.get("/detections/{detection_id}/drift-estimates")
def list_drift_estimates(detection_id: int, db: Session = Depends(get_db)) -> list[dict]:
    """Every backward-drift run for this detection (usually one, but a
    checkpoint fix -- e.g. adding Stokes drift -- can produce more than one,
    kept rather than overwritten so before/after is comparable)."""
    rows = db.execute(
        select(DriftEstimate).where(DriftEstimate.slick_detection_id == detection_id)
        .order_by(DriftEstimate.created_at)
    ).scalars().all()
    return [_drift_estimate_summary(r) for r in rows]


@router.get("/drift-estimates/{drift_estimate_id}")
def get_drift_estimate(drift_estimate_id: int, db: Session = Depends(get_db)) -> dict:
    estimate = db.get(DriftEstimate, drift_estimate_id)
    if estimate is None:
        raise HTTPException(status_code=404, detail=f"No drift estimate {drift_estimate_id}")

    detail = _drift_estimate_summary(estimate)
    # Corridor slices are stored as raw WKT (see app.drift.pipeline._build_corridor)
    # -- decoded to GeoJSON here so the frontend never has to parse WKT itself.
    detail["corridor"] = [
        {"t": slice_["t"], "weight": slice_["weight"], "polygon": mapping(shapely_wkt.loads(slice_["polygon"]))}
        for slice_ in estimate.corridor or []
    ]
    return detail


def _drift_estimate_summary(estimate: DriftEstimate) -> dict:
    return {
        "id": estimate.id,
        "slick_detection_id": estimate.slick_detection_id,
        "method": estimate.method,
        "backtrack_hours": estimate.backtrack_hours,
        "ensemble_size": estimate.ensemble_size,
        "window_start": estimate.window_start.isoformat(),
        "window_end": estimate.window_end.isoformat(),
        "forcing": estimate.forcing,
        "created_at": estimate.created_at.isoformat() if estimate.created_at else None,
    }


@router.get("/drift-estimates/{drift_estimate_id}/geometry")
def get_drift_estimate_geometry(drift_estimate_id: int, db: Session = Depends(get_db)) -> dict:
    """Split out from the summary endpoint: origin_polygon/centroid need a
    real PostGIS round-trip (ST_AsGeoJSON), not a Python-side decode."""
    row = db.execute(
        select(
            func.ST_AsGeoJSON(DriftEstimate.origin_polygon),
            func.ST_AsGeoJSON(DriftEstimate.origin_centroid),
        ).where(DriftEstimate.id == drift_estimate_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"No drift estimate {drift_estimate_id}")
    origin_polygon, origin_centroid = row
    return {"origin_polygon": _geojson(origin_polygon), "origin_centroid": _geojson(origin_centroid)}


@router.get("/drift-estimates/{drift_estimate_id}/candidates")
def list_candidates(drift_estimate_id: int, db: Session = Depends(get_db)) -> list[dict]:
    """Ranked attribution candidates for one drift estimate -- Steps 6-8's
    output. Vessel particulars are joined in where a real AIS-matched vessel
    exists; a dark candidate has none, by definition."""
    rows = db.execute(
        select(
            AttributionCandidate,
            Vessel,
            SarShipDetection,
            func.ST_X(SarShipDetection.geom),
            func.ST_Y(SarShipDetection.geom),
        )
        .outerjoin(Vessel, AttributionCandidate.mmsi == Vessel.mmsi)
        .outerjoin(SarShipDetection, AttributionCandidate.sar_ship_detection_id == SarShipDetection.id)
        .where(AttributionCandidate.drift_estimate_id == drift_estimate_id)
        .order_by(AttributionCandidate.rank)
    ).all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No attribution candidates for drift estimate {drift_estimate_id} "
            "(has attribute-detection been run for it?)",
        )

    estimate = db.get(DriftEstimate, drift_estimate_id)
    incident_id = _incident_id_for_drift_estimate(db, drift_estimate_id)

    def _ais_matched_position(mmsi: int, hours_before_at_closest: float | None) -> tuple[float, float] | None:
        """This candidate's own real AIS position at its real closest
        approach to the drift corridor -- the same instant
        features.py's hours_before_window_end_at_closest_approach already
        measured, not the vessel's latest position by window_end (which, for
        a vessel that kept sailing after the incident, can be a real position
        far down its route rather than anywhere near the corridor)."""
        if incident_id is None or estimate is None:
            return None
        target_ts = estimate.window_end
        if hours_before_at_closest is not None:
            target_ts = estimate.window_end - timedelta(hours=hours_before_at_closest)
        row = db.execute(
            select(func.ST_X(AisPosition.geom), func.ST_Y(AisPosition.geom))
            .where(AisPosition.mmsi == mmsi, AisPosition.incident_id == incident_id)
            .order_by(func.abs(func.extract("epoch", AisPosition.ts - target_ts)))
            .limit(1)
        ).one_or_none()
        return (row[0], row[1]) if row else None

    results = []
    for candidate, vessel, ship_detection, ship_lon, ship_lat in rows:
        position = None
        if candidate.is_dark_candidate and ship_lon is not None:
            position = {"lon": ship_lon, "lat": ship_lat}
        elif candidate.mmsi is not None:
            hours_before = (candidate.features or {}).get("hours_before_window_end_at_closest_approach")
            matched = _ais_matched_position(candidate.mmsi, hours_before)
            if matched:
                position = {"lon": matched[0], "lat": matched[1]}

        entry = {
            "rank": candidate.rank,
            "confidence": candidate.confidence,
            "is_dark_candidate": candidate.is_dark_candidate,
            "mmsi": candidate.mmsi,
            "position": position,
            "vessel": (
                {
                    "name": vessel.name,
                    "vessel_type": vessel.vessel_type,
                    "length_m": vessel.length_m,
                    "width_m": vessel.width_m,
                    "source": vessel.source,
                }
                if vessel
                else None
            ),
            "sar_ship_detection_id": candidate.sar_ship_detection_id,
            "features": candidate.features,
            "shap_values": candidate.shap_values,
            "model_version": candidate.model_version,
        }
        if ship_detection is not None:
            entry["ship_detection"] = {
                "length_estimate_m": ship_detection.length_estimate_m,
                "matched_mmsi": ship_detection.matched_mmsi,
                "match_distance_m": ship_detection.match_distance_m,
            }
        results.append(entry)
    return results


@router.get("/drift-estimates/{drift_estimate_id}/case-summary")
def case_summary(drift_estimate_id: int, top_n: int = 10, db: Session = Depends(get_db)) -> dict:
    """One call bundling everything a frontend needs to render one case:
    the real detection, the real drift estimate (with geometry + corridor),
    and the top-N ranked attribution candidates -- built for a frontend that
    wants a single round-trip rather than composing the individual read
    endpoints above itself. Those endpoints remain available for anything
    needing more detail or a different candidate page size.
    """
    estimate = db.get(DriftEstimate, drift_estimate_id)
    if estimate is None:
        raise HTTPException(status_code=404, detail=f"No drift estimate {drift_estimate_id}")

    detection = db.get(SlickDetection, estimate.slick_detection_id)
    scene = db.get(SarScene, detection.scene_id) if detection else None

    geom_row = db.execute(
        select(
            func.ST_AsGeoJSON(SlickDetection.geom),
            func.ST_AsGeoJSON(DriftEstimate.origin_polygon),
            func.ST_AsGeoJSON(DriftEstimate.origin_centroid),
        )
        .select_from(DriftEstimate)
        .join(SlickDetection, DriftEstimate.slick_detection_id == SlickDetection.id)
        .where(DriftEstimate.id == drift_estimate_id)
    ).one()
    detection_geom, origin_polygon, origin_centroid = geom_row

    candidate_rows = db.execute(
        select(AttributionCandidate, Vessel)
        .outerjoin(Vessel, AttributionCandidate.mmsi == Vessel.mmsi)
        .where(AttributionCandidate.drift_estimate_id == drift_estimate_id)
        .order_by(AttributionCandidate.rank)
        .limit(top_n)
    ).all()

    return {
        "detection": {
            "id": detection.id,
            "scene_product_id": scene.product_id if scene else None,
            "detected_at": detection.detected_at.isoformat(),
            "area_sq_km": detection.area_sq_km,
            "confidence": detection.confidence,
            "geometry": _geojson(detection_geom),
        }
        if detection
        else None,
        "drift_estimate": {
            **_drift_estimate_summary(estimate),
            "origin_polygon": _geojson(origin_polygon),
            "origin_centroid": _geojson(origin_centroid),
        },
        "top_candidates": [
            {
                "rank": candidate.rank,
                "confidence": candidate.confidence,
                "is_dark_candidate": candidate.is_dark_candidate,
                "mmsi": candidate.mmsi,
                "vessel_name": vessel.name if vessel else None,
                "vessel_type": vessel.vessel_type if vessel else None,
            }
            for candidate, vessel in candidate_rows
        ],
        "candidate_count_total": db.scalar(
            select(func.count(AttributionCandidate.id)).where(
                AttributionCandidate.drift_estimate_id == drift_estimate_id
            )
        ),
    }
