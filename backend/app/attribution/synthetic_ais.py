"""Synthetic AIS generation for Steps 6-8 validation, in real MarineCadastre
CSV format (verified against a real downloaded MarineCadastre export, not
guessed -- see ais-2018-10-0{7,8}.csv).

Real AIS for the Mediterranean around Corsica-2018 isn't available (only US
coastal data is, per MarineCadastre's own coverage), which is exactly the gap
SIH's own problem statement anticipates: "Real AIS if available may be used
else synthetic data can be prepared... to demonstrate the functioning of the
algorithm." This generates two files:

- A "scenario" file: the vessels plausibly present during the real Corsica
  collision window, including the two real, publicly documented vessels from
  incidents.py's ground_truth (Ulysse, CSL Virginia) -- planted so the
  attribution pipeline can be checked against an answer already known to be
  correct, not just a plausible-looking one.
- A "background" file: broader normal traffic over a longer window, used only
  to teach the clustering step (Step 8) what a normal route looks like. It
  plays no role in the answer -- it defines the baseline the answer stands
  out against.

Honesty constraint (matches incidents.py's own discipline): Ulysse and CSL
Virginia's real MMSI/IMO are not publicly known (see incidents.py's
`needs_sourcing: equasis` notes) -- fabricating a plausible-looking one would
risk being mistaken for a real identifier later. Every MMSI generated here
comes from a clearly synthetic block (990000000+), and every row is tagged
`source="synthetic"` end to end, not blended with real data unlabeled.
"""
from __future__ import annotations

import csv
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Real, documented facts from incidents.py -- actually imported (not
# duplicated as separate constants) so the two files cannot drift apart
# again. They did once already: an earlier version hard-coded these as a
# copy "for the single source of truth", and when incidents.py was corrected
# with the real BEA mer position, this file's copy silently kept the old,
# wrong one -- synthetic vessels were then planted 32km from where they
# should have been, and a real validation run's tightened search buffer
# (correctly sized for the *real* position) missed them entirely. Importing
# the live value instead of a copy makes that specific mistake impossible.
from app.ingest.incidents import INCIDENTS as _INCIDENTS

_corsica = next(spec for spec in _INCIDENTS if spec["slug"] == "corsica-2018")
COLLISION_TIME: datetime = _corsica["occurred_at"]
COLLISION_LON, COLLISION_LAT = _corsica["center"]

SYNTHETIC_MMSI_START = 990_000_001

CSV_FIELDS = [
    "mmsi", "base_date_time", "longitude", "latitude", "sog", "cog",
    "heading", "vessel_name", "imo", "call_sign", "vessel_type", "status",
    "length", "width", "draft", "cargo", "transceiver",
]

# AIS ship-type codes (ITU-R M.1371), used for realism, not invented.
TYPE_CARGO = 70
TYPE_TANKER = 80
TYPE_PASSENGER = 60
TYPE_RORO = 79  # Type 79: "Cargo, no additional information" bucket ro-ros
# fall into in practice; real ro-ro-specific codes vary by broadcast vendor.


@dataclass
class VesselTrack:
    mmsi: int
    name: str
    vessel_type: int
    length: float
    width: float
    positions: list[tuple[datetime, float, float, float, float, float | None]] = field(
        default_factory=list
    )  # (ts, lon, lat, sog, cog, heading)


def _destination(lon: float, lat: float, bearing_deg: float, distance_nm: float) -> tuple[float, float]:
    """Move (lon, lat) along a great-circle-ish bearing by distance_nm.

    Flat-earth approximation (equirectangular), fine at this spatial scale
    (tens of km) and this is synthetic data anyway -- not worth a full
    geodesic library for positions nobody will navigate by.
    """
    R_nm = 3440.065  # Earth radius in nautical miles
    bearing = math.radians(bearing_deg)
    d_lat = (distance_nm / R_nm) * math.cos(bearing)
    d_lon = (distance_nm / R_nm) * math.sin(bearing) / math.cos(math.radians(lat))
    return lon + math.degrees(d_lon), lat + math.degrees(d_lat)


def _bearing_between(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    d_lon = math.radians(lon2 - lon1)
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    x = math.sin(d_lon) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(d_lon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


# Real, typical-scale imperfections a genuine AIS feed has and a
# too-clean synthetic one otherwise wouldn't: differential-GPS-scale position
# noise (AIS position accuracy is generally a few tens of metres, not exact),
# and periodic reporting gaps (weak signal, satellite handoff, congestion) --
# without these, every candidate's track would be suspiciously smooth and
# complete, which is itself an unrealistic tell the classifier could latch
# onto instead of learning genuine behavioural differences.
GPS_NOISE_DEG = 0.0006  # roughly 50-60m at these latitudes
GAP_PROBABILITY_PER_STEP = 0.03  # ~3% chance any given step starts a gap
GAP_DURATION_STEPS_RANGE = (2, 12)  # a dropped span of a few minutes to ~an hour


def _apply_gaps(rng: random.Random, num_steps: int) -> set[int]:
    """Which step indices to drop entirely, simulating real AIS dropouts."""
    dropped: set[int] = set()
    i = 0
    while i < num_steps:
        if rng.random() < GAP_PROBABILITY_PER_STEP:
            gap_len = rng.randint(*GAP_DURATION_STEPS_RANGE)
            for j in range(i, min(i + gap_len, num_steps)):
                dropped.add(j)
            i += gap_len
        else:
            i += 1
    return dropped


def _track_underway(
    mmsi: int, name: str, vessel_type: int, length: float, width: float,
    start: datetime, end: datetime, step_minutes: int,
    start_lon: float, start_lat: float, bearing_deg: float, speed_knots: float,
    heading_jitter: float = 3.0, rng: random.Random | None = None,
) -> VesselTrack:
    """A vessel moving on a straight course at constant speed, with small
    realistic heading/speed jitter -- not perfectly straight, since real AIS
    never is, but not erratic either (that's reserved for genuinely anomalous
    candidates, which this generator does not create by default). Real-scale
    GPS noise and periodic reporting gaps are applied on top (see
    GPS_NOISE_DEG/GAP_PROBABILITY_PER_STEP above)."""
    rng = rng or random.Random(mmsi)
    track = VesselTrack(mmsi, name, vessel_type, length, width)
    lon, lat = start_lon, start_lat
    ts = start
    step_hours = step_minutes / 60.0

    raw_steps: list[tuple[datetime, float, float, float, float]] = []
    while ts <= end:
        jittered_bearing = bearing_deg + rng.uniform(-heading_jitter, heading_jitter)
        jittered_speed = max(0.5, speed_knots + rng.uniform(-0.5, 0.5))
        raw_steps.append((ts, lon, lat, round(jittered_speed, 1), round(jittered_bearing, 1)))
        lon, lat = _destination(lon, lat, jittered_bearing, jittered_speed * step_hours)
        ts += timedelta(minutes=step_minutes)

    dropped = _apply_gaps(rng, len(raw_steps))
    for i, (ts, lo, la, sog, cog) in enumerate(raw_steps):
        if i in dropped:
            continue
        noisy_lon = lo + rng.uniform(-GPS_NOISE_DEG, GPS_NOISE_DEG)
        noisy_lat = la + rng.uniform(-GPS_NOISE_DEG, GPS_NOISE_DEG)
        track.positions.append((ts, noisy_lon, noisy_lat, sog, cog, None))
    return track


def _track_anchored(
    mmsi: int, name: str, vessel_type: int, length: float, width: float,
    start: datetime, end: datetime, step_minutes: int,
    lon: float, lat: float, rng: random.Random | None = None,
) -> VesselTrack:
    """A vessel at anchor: near-zero speed, tiny GPS-noise-scale position
    jitter (a real anchored ship swings on its chain, it doesn't sit at one
    exact coordinate for 24h), plus the same real reporting-gap behaviour as
    an underway track."""
    rng = rng or random.Random(mmsi)
    track = VesselTrack(mmsi, name, vessel_type, length, width)

    raw_steps: list[datetime] = []
    ts = start
    while ts <= end:
        raw_steps.append(ts)
        ts += timedelta(minutes=step_minutes)

    dropped = _apply_gaps(rng, len(raw_steps))
    for i, ts in enumerate(raw_steps):
        if i in dropped:
            continue
        jlon = lon + rng.uniform(-0.001, 0.001)
        jlat = lat + rng.uniform(-0.001, 0.001)
        sog = round(rng.uniform(0.0, 0.3), 1)
        heading = round(rng.uniform(0, 360), 1)
        track.positions.append((ts, jlon, jlat, sog, heading, heading))
    return track


def build_corsica_scenario(
    window_start: datetime = COLLISION_TIME - timedelta(hours=24),
    window_end: datetime = COLLISION_TIME + timedelta(hours=24),
    num_decoys: int = 15,
    seed: int = 42,
) -> list[VesselTrack]:
    """The vessels plausibly present during the real evidence-based window
    around the real Corsica collision -- the two real, documented vessels
    plus decoy traffic on real nearby shipping lanes.

    Real facts encoded (from incidents.py's ground_truth, itself sourced from
    press reporting -- not invented here): Ulysse (Tunisian ro-ro, striking
    vessel, underway) struck CSL Virginia (Cypriot container ship, struck
    vessel, at anchor) off Cap Corse. Neither vessel's real MMSI/IMO is
    publicly known, so both use synthetic placeholder identifiers -- only the
    real names and real roles (anchored vs underway) are asserted as fact.
    """
    rng = random.Random(seed)
    tracks: list[VesselTrack] = []

    # CSL Virginia: at anchor at the real (approximate) collision point,
    # for the whole window -- it was struck, not the one that moved.
    csl_virginia = _track_anchored(
        mmsi=SYNTHETIC_MMSI_START, name="CSL VIRGINIA", vessel_type=TYPE_CARGO,
        length=260.0, width=32.0, start=window_start, end=window_end,
        step_minutes=2, lon=COLLISION_LON, lat=COLLISION_LAT, rng=rng,
    )
    tracks.append(csl_virginia)

    # Ulysse: underway, on a course that passes through CSL Virginia's
    # position at the real collision instant, then continues past afterward
    # (the real report has it as the striking, not sunk, vessel).
    approach_bearing = 225.0  # arriving from the northeast, continuing southwest
    hours_of_approach = 6.0
    approach_speed = 16.0
    start_lon, start_lat = _destination(
        COLLISION_LON, COLLISION_LAT, (approach_bearing + 180) % 360,
        approach_speed * hours_of_approach,
    )
    ulysse_pre = _track_underway(
        mmsi=SYNTHETIC_MMSI_START + 1, name="ULYSSE", vessel_type=TYPE_RORO,
        length=170.0, width=25.0,
        start=COLLISION_TIME - timedelta(hours=hours_of_approach), end=COLLISION_TIME,
        step_minutes=2, start_lon=start_lon, start_lat=start_lat,
        bearing_deg=approach_bearing, speed_knots=approach_speed, rng=rng,
    )
    ulysse_post = _track_underway(
        mmsi=SYNTHETIC_MMSI_START + 1, name="ULYSSE", vessel_type=TYPE_RORO,
        length=170.0, width=25.0,
        start=COLLISION_TIME + timedelta(minutes=2), end=window_end,
        step_minutes=2, start_lon=COLLISION_LON, start_lat=COLLISION_LAT,
        bearing_deg=approach_bearing, speed_knots=approach_speed * 0.7, rng=rng,
    )
    ulysse_pre.positions += ulysse_post.positions
    tracks.append(ulysse_pre)

    # Decoy traffic: real nearby Mediterranean lanes (Genoa-Civitavecchia,
    # Bastia-Livorno, Marseille-Rome corridor), at varied distances from the
    # incident and no anomalous behaviour -- these exist so Step 6/8 must
    # actually distinguish the real candidates from a busy background, not
    # just return "the only two vessels in the file."
    lanes = [
        # (start bearing from collision point, distance_nm, course bearing, speed)
        (10, 40, 190, 18.0), (350, 60, 170, 14.0), (270, 30, 90, 20.0),
        (95, 50, 275, 16.0), (200, 25, 20, 12.0), (135, 45, 315, 19.0),
    ]
    for i in range(num_decoys):
        lane_bearing, distance, course, speed = lanes[i % len(lanes)]
        jitter_distance = distance + rng.uniform(-8, 8)
        jitter_bearing = lane_bearing + rng.uniform(-15, 15)
        lon, lat = _destination(COLLISION_LON, COLLISION_LAT, jitter_bearing, jitter_distance)
        vtype = rng.choice([TYPE_CARGO, TYPE_TANKER, TYPE_PASSENGER])
        track = _track_underway(
            mmsi=SYNTHETIC_MMSI_START + 100 + i,
            name=f"DECOY VESSEL {i + 1}", vessel_type=vtype,
            length=rng.uniform(80, 250), width=rng.uniform(12, 35),
            start=window_start, end=window_end, step_minutes=3,
            start_lon=lon, start_lat=lat,
            bearing_deg=course + rng.uniform(-10, 10),
            speed_knots=speed + rng.uniform(-2, 2), rng=rng,
        )
        tracks.append(track)

    # A genuine confounder, not just distant background noise: a vessel that
    # transits very close to the real collision point -- close enough that a
    # naive distance-only heuristic would flag it -- but several hours off
    # from the actual collision instant. Real Step 8 features (time-of-
    # closest-approach) must be what separates it from the real candidates,
    # not proximity alone.
    close_call_bearing = rng.uniform(0, 360)
    close_call_time_offset = rng.choice([-8, -7, 7, 8])  # hours from the real collision
    close_call_time = COLLISION_TIME + timedelta(hours=close_call_time_offset)
    close_lon, close_lat = _destination(COLLISION_LON, COLLISION_LAT, close_call_bearing, 3.0)
    close_start_lon, close_start_lat = _destination(
        close_lon, close_lat, (close_call_bearing + 180) % 360, 15.0 * 2
    )
    close_call = _track_underway(
        mmsi=SYNTHETIC_MMSI_START + 200, name="CLOSE CALL VESSEL", vessel_type=TYPE_CARGO,
        length=rng.uniform(100, 200), width=20,
        start=close_call_time - timedelta(hours=2), end=close_call_time + timedelta(hours=2),
        step_minutes=3, start_lon=close_start_lon, start_lat=close_start_lat,
        bearing_deg=close_call_bearing, speed_knots=15.0, rng=rng,
    )
    tracks.append(close_call)

    return tracks


def build_background_traffic(
    window_start: datetime = COLLISION_TIME - timedelta(days=7),
    window_end: datetime = COLLISION_TIME,
    num_vessels: int = 250,
    seed: int = 7,
) -> list[VesselTrack]:
    """Broader normal traffic for Step 8's clustering baseline -- defines
    what a normal route looks like, so a candidate's deviation from it is
    measurable. Plays no role in the incident answer itself."""
    rng = random.Random(seed)
    lanes = [
        (10, 40, 190, 18.0), (350, 60, 170, 14.0), (270, 30, 90, 20.0),
        (95, 50, 275, 16.0), (200, 25, 20, 12.0), (135, 45, 315, 19.0),
        (60, 70, 240, 15.0), (300, 35, 130, 17.0),
    ]
    tracks: list[VesselTrack] = []
    for i in range(num_vessels):
        lane_bearing, distance, course, speed = lanes[i % len(lanes)]
        jitter_distance = distance + rng.uniform(-15, 15)
        jitter_bearing = lane_bearing + rng.uniform(-20, 20)
        lon, lat = _destination(COLLISION_LON, COLLISION_LAT, jitter_bearing, jitter_distance)
        # Stagger start times across the week so the file isn't 250 vessels
        # all transiting at once -- a real week of traffic is spread out.
        vessel_start = window_start + timedelta(
            hours=rng.uniform(0, (window_end - window_start).total_seconds() / 3600)
        )
        vessel_end = min(vessel_start + timedelta(hours=rng.uniform(4, 20)), window_end)
        vtype = rng.choice([TYPE_CARGO, TYPE_TANKER, TYPE_PASSENGER])
        track = _track_underway(
            mmsi=SYNTHETIC_MMSI_START + 1000 + i,
            name=f"BG VESSEL {i + 1}", vessel_type=vtype,
            length=rng.uniform(80, 250), width=rng.uniform(12, 35),
            start=vessel_start, end=vessel_end, step_minutes=5,
            start_lon=lon, start_lat=lat,
            bearing_deg=course + rng.uniform(-10, 10),
            speed_knots=speed + rng.uniform(-2, 2), rng=rng,
        )
        tracks.append(track)
    return tracks


def write_marinecadastre_csv(tracks: list[VesselTrack], out_path: Path) -> int:
    """Write tracks in the real, verified MarineCadastre column format
    (checked against an actual downloaded export, see module docstring)."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows_written = 0
    with out_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for track in tracks:
            for ts, lon, lat, sog, cog, heading in track.positions:
                writer.writerow({
                    "mmsi": track.mmsi,
                    "base_date_time": ts.strftime("%Y-%m-%d %H:%M:%S"),
                    "longitude": round(lon, 5),
                    "latitude": round(lat, 5),
                    "sog": sog,
                    "cog": cog,
                    "heading": heading if heading is not None else "",
                    "vessel_name": track.name,
                    "imo": "",  # genuinely unknown for the real named vessels -- never fabricated
                    "call_sign": "",
                    "vessel_type": track.vessel_type,
                    "status": "1" if sog < 0.5 else "0",  # 1=at anchor, 0=under way, real AIS codes
                    "length": round(track.length, 1),
                    "width": round(track.width, 1),
                    "draft": "",
                    "cargo": "",
                    "transceiver": "A",
                })
                rows_written += 1
    return rows_written
