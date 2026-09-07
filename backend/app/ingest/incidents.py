"""Seed data for the documented incidents the pipeline is validated against.

Everything here is public record, transcribed from reporting and official
investigation material. Two rules govern this file:

1. Nothing in `ground_truth` is ever produced by the pipeline. It is the
   yardstick the pipeline's own output is measured against, so if the pipeline
   could influence it the validation would be circular.

2. Identifiers we do not actually know are NULL, never guessed. In particular
   MMSI and IMO numbers are left unset with `needs_sourcing` recording where to
   get them (Equasis). These are the keys attribution joins on, so a plausible-
   looking but wrong IMO would silently implicate a real vessel that had nothing
   to do with the spill. An empty field fails loudly; a fabricated one does not.

Coordinates carry an explicit `precision` marker for the same reason — several
are derived from press descriptions ("~28 km NW of Cap Corse") rather than from
the investigation's own position fix, and the drift backtracking in Stage 4 must
not treat them as survey-grade.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SRID, Incident

INCIDENTS: list[dict] = [
    {
        "slug": "corsica-2018",
        "name": "Ulysse / CSL Virginia collision, Corsica",
        "description": (
            "The Tunisian ro-ro Ulysse struck the Cypriot container ship "
            "CSL Virginia, which was at anchor, off Cap Corse in the "
            "Mediterranean. The collision breached CSL Virginia's fuel tanks "
            "and released heavy fuel oil, producing a slick that was tracked "
            "over several days."
        ),
        # Real, precise values from the official BEA mer investigation report
        # (not press-derived): "The collision on 7 October at 7.02 am" --
        # "All hours in French local time, UTC+2" -> 05:02 UTC. Position "at
        # position 43 14'.9 N / 9 28'.7 E" (collision instant, quoted
        # amidships) -- see sources below. This replaced an earlier
        # press-derived placeholder (06:00 UTC, 9.10 E/43.15 N) that turned
        # out to be ~32km off from this real position -- found only after
        # comparing a real OpenDrift backward-drift estimate against it and
        # noticing the gap was too large to be simulation error alone.
        "occurred_at": datetime(2018, 10, 7, 5, 2, tzinfo=timezone.utc),
        "center": (9.4783, 43.2483),  # lon, lat -- 9 28.7' E / 43 14.9' N
        "aoi": (8.90, 43.00, 10.05, 43.60),  # minlon, minlat, maxlon, maxlat
        "validates": ["detection", "drift"],
        "ground_truth": {
            "summary": (
                "Collision between an under-way ro-ro and an anchored container "
                "ship; the anchored vessel's bunker tanks were breached."
            ),
            "vessels": [
                {
                    "name": "Ulysse",
                    "role": "striking_vessel",
                    "flag": "Tunisia",
                    "type": "ro-ro",
                    "mmsi": None,
                    "imo": None,
                    "needs_sourcing": "equasis",
                },
                {
                    "name": "CSL Virginia",
                    "role": "struck_vessel_source_of_oil",
                    "flag": "Cyprus",
                    "type": "container",
                    "mmsi": None,
                    "imo": None,
                    "needs_sourcing": "equasis",
                    "note": "At anchor when struck; the oil released came from this hull.",
                },
            ],
            # Why this case is useful beyond having a known answer: the
            # attribution model needs to learn that a vessel stationary at
            # anchor can be the oil's source while a moving vessel is the cause,
            # which a pure proximity-and-motion heuristic gets backwards.
            "attribution_note": (
                "Source of oil and cause of collision are different vessels. "
                "A naive 'nearest moving vessel' heuristic identifies Ulysse as "
                "the source, which is wrong about where the oil came from."
            ),
            "position_precision": "official_investigation_position_fix",
        },
        "sources": [
            {
                "type": "official_investigation",
                "authority": "BEA mer (France)",
                "note": (
                    "Primary reference for position fix, timing, and vessel "
                    "kinematics. Position and time above are quoted directly "
                    "from this report, not press-derived."
                ),
                "url": "https://www.bea-mer.developpement-durable.gouv.fr/IMG/pdf/beamer-fr_csl_virginia_-_ulysse__fr-en__2018.pdf",
                "status": "retrieved",
            },
        ],
    },
    {
        "slug": "fujairah-kalba-2019",
        "name": "Vessel collision oil spill, Fujairah/Kalba coast",
        "description": (
            "Two commercial vessels collided off the Fujairah/Kalba coastline "
            "(UAE east coast, Gulf of Oman), rupturing a hold and releasing "
            "diesel that formed a roughly 3km slick along the coast. Two "
            "captains were subsequently charged; reported damages ~Dh14 "
            "million."
        ),
        # Press reporting places this in October 2019 but does not give the
        # exact day -- occurred_at is set to mid-month only so search-scenes'
        # window (days_before/days_after) can be widened to cover the whole
        # month; the real date must come from an evidence-based scan-log
        # transition (Step 3), not from this placeholder.
        "occurred_at": datetime(2019, 10, 16, 0, 0, tzinfo=timezone.utc),
        "center": (56.35, 25.05),  # lon, lat -- Fujairah/Kalba coastline
        "aoi": (56.15, 24.95, 56.55, 25.35),
        "validates": ["detection", "drift"],
        "ground_truth": {
            "summary": (
                "Collision between two commercial vessels off Fujairah/Kalba; "
                "a hold was breached, releasing diesel."
            ),
            "vessels": [
                {
                    "name": None,
                    "role": "unknown_of_two_colliding_vessels",
                    "flag": None,
                    "type": None,
                    "mmsi": None,
                    "imo": None,
                    "needs_sourcing": "court_record_not_yet_public_by_name",
                },
            ],
            "attribution_note": (
                "Vessel names/IMOs are not in public reporting found so far -- "
                "only that two captains were charged. Do not fabricate names; "
                "this incident currently supports detection/drift validation "
                "only, not attribution."
            ),
            "position_precision": "coastline_approximate_from_press_reports",
            "date_precision": "month_only_from_press_reports",
        },
        "sources": [
            {
                "type": "press",
                "outlet": "The National",
                "url": "https://www.thenationalnews.com/uae/environment/two-captains-accused-of-fujairah-oil-spill-1.967316",
                "note": "Two captains accused of Fujairah oil spill.",
            },
            {
                "type": "press",
                "outlet": "The National",
                "url": "https://www.thenationalnews.com/uae/oil-spill-off-uae-s-east-coast-forces-closure-of-kalba-beach-1.1068828",
                "note": "Oil spill off UAE's east coast forces closure of Kalba beach.",
            },
        ],
    },
    {
        "slug": "singapore-2024",
        "name": "Vox Maxima / Marine Honour allision, Pasir Panjang Terminal",
        "description": (
            "The Netherlands-flagged dredger Vox Maxima suffered a loss of "
            "engine and steering control and struck the stationary "
            "Singapore-flagged bunker vessel Marine Honour at Pasir Panjang "
            "Terminal, releasing low-sulphur fuel oil that subsequently reached "
            "shorelines including East Coast Park, Sentosa and Labrador."
        ),
        "occurred_at": datetime(2024, 6, 14, 6, 0, tzinfo=timezone.utc),
        "center": (103.765, 1.275),  # Pasir Panjang Terminal, approximate
        "aoi": (103.60, 1.15, 104.05, 1.35),
        "validates": ["attribution"],
        "ground_truth": {
            "summary": (
                "Dredger lost propulsion/steering control and struck a "
                "stationary bunker vessel alongside the terminal."
            ),
            "vessels": [
                {
                    "name": "Vox Maxima",
                    "role": "striking_vessel",
                    "flag": "Netherlands",
                    "type": "dredger",
                    "mmsi": None,
                    "imo": None,
                    "needs_sourcing": "equasis",
                },
                {
                    "name": "Marine Honour",
                    "role": "struck_vessel_source_of_oil",
                    "flag": "Singapore",
                    "type": "bunker_tanker",
                    "mmsi": None,
                    "imo": None,
                    "needs_sourcing": "equasis",
                },
            ],
            "attribution_note": (
                "Busy strait with heavy nearby traffic, so the correct answer "
                "must be recovered from a crowded candidate field rather than "
                "from being the only vessel present."
            ),
            "position_precision": "terminal_location_approximate",
        },
        "sources": [
            {
                "type": "authority_records",
                "authority": "MPA Singapore",
                "status": "to_be_retrieved",
            },
            {
                "type": "court_record",
                "note": "Referenced as establishing responsibility; citation to be attached.",
                "status": "to_be_retrieved",
            },
        ],
    },
]


def aoi_to_wkt(bbox: tuple[float, float, float, float]) -> str:
    """Turn a (minlon, minlat, maxlon, maxlat) box into a closed POLYGON WKT."""
    minlon, minlat, maxlon, maxlat = bbox
    ring = [
        (minlon, minlat),
        (maxlon, minlat),
        (maxlon, maxlat),
        (minlon, maxlat),
        (minlon, minlat),
    ]
    coords = ", ".join(f"{lon} {lat}" for lon, lat in ring)
    return f"POLYGON(({coords}))"


def center_to_wkt(center: tuple[float, float]) -> str:
    lon, lat = center
    return f"POINT({lon} {lat})"


def seed_incidents(session: Session) -> dict[str, int]:
    """Upsert the incident registry, keyed on slug.

    Idempotent so it can run on every startup or redeploy. Updates in place
    rather than deleting and reinserting, because scenes and AIS positions
    reference these rows by id.
    """
    counts = {"created": 0, "updated": 0}

    for spec in INCIDENTS:
        incident = session.scalar(
            select(Incident).where(Incident.slug == spec["slug"])
        )
        if incident is None:
            incident = Incident(slug=spec["slug"])
            session.add(incident)
            counts["created"] += 1
        else:
            counts["updated"] += 1

        incident.name = spec["name"]
        incident.description = spec["description"]
        incident.occurred_at = spec["occurred_at"]
        incident.center = f"SRID={SRID};{center_to_wkt(spec['center'])}"
        incident.aoi = f"SRID={SRID};{aoi_to_wkt(spec['aoi'])}"
        incident.validates = spec["validates"]
        incident.ground_truth = spec["ground_truth"]
        incident.sources = spec["sources"]

    session.commit()
    return counts
