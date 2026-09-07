import numpy as np
import pytest
from shapely.geometry import MultiPolygon, Polygon, box

from app.ml.age_heuristic import (
    AgeEstimate,
    compactness_score,
    estimate_age,
    fragmentation_score,
    suggest_backtrack_hours,
)


def _circle(radius: float = 50.0) -> MultiPolygon:
    return MultiPolygon([Polygon(box(0, 0, radius, radius).exterior).buffer(0)])


def test_elongated_shape_scores_more_weathered_than_compact_one():
    compact = MultiPolygon([box(0, 0, 100, 100)])
    elongated = MultiPolygon([box(0, 0, 400, 8)])
    assert compactness_score(elongated) > compactness_score(compact)


def test_fragmentation_uses_density_not_raw_count():
    # Same fragment count, ten times the area: the larger slick must not be
    # judged as weathered as the small one, or the feature is just measuring size.
    pieces = MultiPolygon([box(0, 0, 10, 10), box(20, 0, 30, 10), box(40, 0, 50, 10)])
    small = fragmentation_score(pieces, area_sq_km=0.5)
    large = fragmentation_score(pieces, area_sq_km=5.0)
    assert small > large


def test_missing_wind_drops_contrast_and_lowers_confidence():
    mask = np.zeros((200, 200), dtype=bool)
    mask[50:150, 50:150] = True
    backscatter = np.full((200, 200), -10.0, dtype=np.float32)
    backscatter[mask] = -22.0

    estimate = estimate_age(
        geometry=MultiPolygon([box(0, 0, 1, 1)]),
        pixel_geometry=MultiPolygon([box(50, 50, 150, 150)]),
        slick_mask=mask,
        backscatter_db=backscatter,
        area_sq_km=1.0,
        wind_speed_ms=None,
    )
    assert "contrast_db" not in estimate.features
    assert estimate.confidence == "low"
    assert any("wind" in note.lower() for note in estimate.notes)


def test_wind_outside_interpretable_band_is_rejected():
    mask = np.zeros((200, 200), dtype=bool)
    mask[50:150, 50:150] = True
    backscatter = np.full((200, 200), -10.0, dtype=np.float32)
    backscatter[mask] = -22.0

    # 15 m/s roughens the sea enough to wash out a slick's signature regardless
    # of its age, so the contrast feature must not be trusted here.
    estimate = estimate_age(
        geometry=MultiPolygon([box(0, 0, 1, 1)]),
        pixel_geometry=MultiPolygon([box(50, 50, 150, 150)]),
        slick_mask=mask,
        backscatter_db=backscatter,
        area_sq_km=1.0,
        wind_speed_ms=15.0,
    )
    assert "contrast_db" not in estimate.features
    assert estimate.confidence == "low"


def test_confidence_never_reaches_high():
    # The contrast feature needs cv2, which only the ml image installs.
    pytest.importorskip("cv2")
    # The thresholds are literature-informed and calibrated against exactly zero
    # age-labelled examples, so "high" must be unreachable by construction.
    mask = np.zeros((300, 300), dtype=bool)
    mask[100:200, 100:200] = True
    backscatter = np.full((300, 300), -8.0, dtype=np.float32)
    backscatter[mask] = -20.0

    estimate = estimate_age(
        geometry=MultiPolygon([box(0, 0, 1, 1)]),
        pixel_geometry=MultiPolygon([box(100, 100, 200, 200)]),
        slick_mask=mask,
        backscatter_db=backscatter,
        area_sq_km=2.0,
        wind_speed_ms=5.0,
    )
    assert estimate.confidence in {"low", "medium", "none"}


def test_tiny_slick_is_downgraded_to_low_confidence():
    pytest.importorskip("cv2")
    mask = np.zeros((100, 100), dtype=bool)
    mask[40:60, 40:60] = True
    backscatter = np.full((100, 100), -9.0, dtype=np.float32)
    backscatter[mask] = -21.0

    estimate = estimate_age(
        geometry=MultiPolygon([box(0, 0, 1, 1)]),
        pixel_geometry=MultiPolygon([box(40, 40, 60, 60)]),
        slick_mask=mask,
        backscatter_db=backscatter,
        area_sq_km=0.001,
        wind_speed_ms=5.0,
    )
    assert estimate.confidence == "low"


def test_low_confidence_never_narrows_the_backtrack_window():
    # A shortened window that excludes the true release time is a far worse
    # failure than an over-wide one, so a weak signal must not shorten it.
    weak = AgeEstimate(band="likely-fresh", weathering_score=0.1, confidence="low")
    hours, reason = suggest_backtrack_hours(weak, revisit_gap_hours=288.0)
    assert hours == 288.0
    assert "not confident" in reason.lower()


def test_confident_fresh_reading_narrows_the_window():
    strong = AgeEstimate(band="likely-fresh", weathering_score=0.15, confidence="medium")
    hours, reason = suggest_backtrack_hours(strong, revisit_gap_hours=288.0)
    assert hours < 288.0
    assert "narrowed" in reason.lower()


def test_weathered_reading_keeps_the_full_window():
    old = AgeEstimate(band="likely-weathered", weathering_score=0.8, confidence="medium")
    hours, _ = suggest_backtrack_hours(old, revisit_gap_hours=288.0)
    assert hours == 288.0


def test_no_computable_features_yields_unknown_not_a_guess():
    estimate = estimate_age(
        geometry=None,
        pixel_geometry=None,
        slick_mask=np.zeros((10, 10), dtype=bool),
        backscatter_db=np.zeros((10, 10), dtype=np.float32),
        area_sq_km=0.0,
        wind_speed_ms=None,
    )
    assert estimate.band == "unknown"
    assert estimate.confidence == "none"
