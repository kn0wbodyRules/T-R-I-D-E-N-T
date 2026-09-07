"""Coarse weathering-age estimate for a detected slick.

Deliberately not a trained model. No age-labelled SAR dataset exists in anything
we hold — Zenodo, refined-SOS and Krestenitis all label *where* oil is, never
*when* it was released — so there is nothing to learn a regression from. What
follows is four literature-informed morphological and radiometric proxies,
combined into a coarse band with an explicit confidence tag.

The point of the band, rather than an hour figure, is that OpenDrift's backtrack
window is the thing being narrowed. A three-way band tightens that window
usefully when the signal is clear, while an invented "6.2 hours" would imply a
precision that nothing here supports and would propagate into an attribution
that names a real vessel.

Every threshold below is an adjustable module constant, not a fitted parameter.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)

# Contrast is only interpretable inside this wind band. Below it, a low-wind
# glassy patch mimics a slick's radar signature no matter its age; above it,
# wind roughening washes the signature out regardless. Outside the band the
# feature is dropped rather than trusted, and the remaining weights renormalise.
WIND_MIN_MS = 2.0
WIND_MAX_MS = 8.0

FEATURE_WEIGHTS = {
    "compactness": 0.30,
    "fragmentation": 0.25,
    "contrast": 0.25,
    "texture": 0.20,
}

FRESH_BELOW = 0.35
WEATHERED_ABOVE = 0.65

# Polygons smaller than this make the shape statistics noise-dominated.
MIN_RELIABLE_AREA_SQ_KM = 0.05


@dataclass
class AgeEstimate:
    band: str
    weathering_score: float
    confidence: str
    features: dict = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "band": self.band,
            "weathering_score": round(self.weathering_score, 4),
            "confidence": self.confidence,
            "features": {k: round(v, 4) for k, v in self.features.items()},
            "notes": self.notes,
            "method": "heuristic_v1",
        }


def _normalise(value: float, low: float, high: float) -> float:
    """Map a raw feature onto 0 (fresh) .. 1 (weathered), clipped."""
    if high == low:
        return 0.5
    return float(np.clip((value - low) / (high - low), 0.0, 1.0))


def compactness_score(geometry) -> float | None:
    """Polsby-Popper: 4*pi*A / P^2. 1.0 is a circle, lower is more drawn out.

    A fresh release is roughly compact around its source; wind and current shear
    stretch it into filaments over time. Inverted here so higher means older.
    """
    try:
        area = geometry.area
        perimeter = geometry.length
        if perimeter <= 0 or area <= 0:
            return None
        polsby_popper = float(np.clip(4 * np.pi * area / (perimeter**2), 0.0, 1.0))
        return 1.0 - polsby_popper
    except Exception:
        return None


def fragmentation_score(geometry, area_sq_km: float) -> float | None:
    """Fragments per km^2.

    Density rather than a raw count, because a large fresh spill naturally
    breaks into more pieces than a small one; the raw count would mostly measure
    spill size.
    """
    if area_sq_km <= 0:
        return None
    fragments = len(getattr(geometry, "geoms", [geometry]))
    density = fragments / max(area_sq_km, 1e-6)
    return _normalise(density, low=0.1, high=5.0)


def contrast_score(
    backscatter_db: np.ndarray,
    slick_mask: np.ndarray,
    dilation_px: int = 20,
) -> tuple[float | None, float | None]:
    """Damping contrast between the slick and the sea ringing it.

    Thick fresh oil suppresses capillary waves hard and reads very dark against
    the surrounding sea. As it thins and emulsifies the suppression weakens.
    Compared against a local ring rather than the whole scene, so a scene-wide
    sea-state gradient does not masquerade as age.
    """
    import cv2

    try:
        mask = slick_mask.astype(np.uint8)
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (dilation_px * 2 + 1, dilation_px * 2 + 1)
        )
        ring = cv2.dilate(mask, kernel) - mask

        inside = backscatter_db[mask.astype(bool)]
        outside = backscatter_db[ring.astype(bool)]
        if inside.size < 10 or outside.size < 10:
            return None, None

        contrast_db = float(np.mean(outside) - np.mean(inside))
        # Strong contrast (~12 dB) reads fresh; weak (~2 dB) reads weathered.
        return 1.0 - _normalise(contrast_db, low=2.0, high=12.0), contrast_db
    except Exception:
        return None, None


def texture_score(backscatter_db: np.ndarray, slick_mask: np.ndarray) -> float | None:
    """Internal homogeneity of the slick's backscatter.

    A coefficient-of-variation proxy rather than a full GLCM, which would pull
    in scikit-image for one feature. Weathering mixes and disperses oil toward a
    more uniform thin film; fresher slicks retain patchier thick-thin structure.
    """
    try:
        values = backscatter_db[slick_mask.astype(bool)]
        if values.size < 50:
            return None
        spread = float(np.std(values))
        homogeneity = 1.0 / (1.0 + spread)
        return _normalise(homogeneity, low=0.1, high=0.6)
    except Exception:
        return None


def estimate_age(
    geometry,
    pixel_geometry,
    slick_mask: np.ndarray,
    backscatter_db: np.ndarray,
    area_sq_km: float,
    wind_speed_ms: float | None = None,
) -> AgeEstimate:
    """Combine the four proxies into a band plus a confidence tag."""
    features: dict[str, float] = {}
    notes: list[str] = []
    scores: dict[str, float] = {}

    compactness = compactness_score(pixel_geometry)
    if compactness is not None:
        scores["compactness"] = compactness
        features["compactness_elongation"] = compactness

    fragmentation = fragmentation_score(pixel_geometry, area_sq_km)
    if fragmentation is not None:
        scores["fragmentation"] = fragmentation
        features["fragmentation"] = fragmentation

    wind_usable = wind_speed_ms is not None and WIND_MIN_MS <= wind_speed_ms <= WIND_MAX_MS
    if wind_usable:
        contrast, contrast_db = contrast_score(backscatter_db, slick_mask)
        if contrast is not None:
            scores["contrast"] = contrast
            features["contrast_db"] = contrast_db
    elif wind_speed_ms is None:
        notes.append("No wind speed supplied; damping-contrast feature dropped.")
    else:
        notes.append(
            f"Wind {wind_speed_ms:.1f} m/s outside the {WIND_MIN_MS}-{WIND_MAX_MS} m/s "
            f"band where slick contrast is interpretable; feature dropped."
        )

    texture = texture_score(backscatter_db, slick_mask)
    if texture is not None:
        scores["texture"] = texture
        features["texture_homogeneity"] = texture

    if not scores:
        return AgeEstimate(
            band="unknown",
            weathering_score=float("nan"),
            confidence="none",
            features={},
            notes=notes + ["No age feature could be computed."],
        )

    total_weight = sum(FEATURE_WEIGHTS[name] for name in scores)
    weathering = sum(FEATURE_WEIGHTS[name] * value for name, value in scores.items())
    weathering /= total_weight

    if weathering < FRESH_BELOW:
        band = "likely-fresh"
    elif weathering < WEATHERED_ABOVE:
        band = "likely-intermediate"
    else:
        band = "likely-weathered"

    # Capped at medium by construction: these thresholds are literature-informed
    # and have never been calibrated against a single age-labelled example.
    confidence = "medium"
    if len(scores) < 3:
        confidence = "low"
        notes.append(f"Only {len(scores)} of 4 features computable.")
    if area_sq_km < MIN_RELIABLE_AREA_SQ_KM:
        confidence = "low"
        notes.append(
            f"Slick area {area_sq_km:.3f} km2 is below {MIN_RELIABLE_AREA_SQ_KM} km2; "
            f"shape statistics are noise-dominated at this size."
        )
    if not wind_usable:
        confidence = "low"

    if wind_speed_ms is not None:
        features["wind_speed_ms_used"] = float(wind_speed_ms)

    return AgeEstimate(
        band=band,
        weathering_score=weathering,
        confidence=confidence,
        features=features,
        notes=notes,
    )


def suggest_backtrack_hours(
    estimate: AgeEstimate,
    revisit_gap_hours: float,
) -> tuple[float, str]:
    """Narrow OpenDrift's backtrack window, when the evidence supports it.

    `revisit_gap_hours` is the honest worst case: the slick could have been
    released any time since the previous satellite pass. This only ever shortens
    that, never lengthens it, and only at medium confidence — a low-confidence
    band shortening the search could hide the true origin outside the window
    entirely, which is a far worse failure than searching too widely.
    """
    if estimate.confidence not in {"medium"} or estimate.band == "unknown":
        return revisit_gap_hours, "Full revisit gap retained (age estimate not confident)."

    fractions = {
        "likely-fresh": 0.35,
        "likely-intermediate": 0.70,
        "likely-weathered": 1.0,
    }
    fraction = fractions.get(estimate.band, 1.0)
    hours = revisit_gap_hours * fraction
    if fraction >= 1.0:
        return revisit_gap_hours, "Full revisit gap retained (slick appears weathered)."
    return hours, (
        f"Backtrack narrowed to {fraction:.0%} of the {revisit_gap_hours:.0f}h revisit "
        f"gap on a {estimate.band} reading ({estimate.confidence} confidence)."
    )
