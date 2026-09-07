"""Cleanup, vectorisation, and geocoding of a predicted class map."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import transform, unary_union

from app.ml.classes import OIL

logger = logging.getLogger(__name__)

# Sentinel-1 IW GRD ground sampling distance. Used to convert pixel counts to
# areas; refined per-product where the metadata provides it.
DEFAULT_PIXEL_SIZE_M = 10.0

EARTH_RADIUS_M = 6_371_000.0


@dataclass
class SlickCandidate:
    geometry: MultiPolygon  # lon/lat, EPSG:4326
    pixel_geometry: MultiPolygon  # original pixel space, for feature extraction
    area_sq_km: float
    orientation_deg: float | None
    confidence: float
    pixel_mask: np.ndarray = field(repr=False)


def clean_mask(class_map: np.ndarray, target_class: int = OIL) -> np.ndarray:
    """Morphological open-then-close on the target class.

    Opening drops isolated speckle-driven pixels, which SAR produces in
    abundance and which would otherwise vectorise into thousands of meaningless
    one-pixel polygons. Closing then re-joins a slick that noise split into
    pieces. Order matters: closing first would consolidate the noise instead of
    removing it.
    """
    import cv2

    binary = (class_map == target_class).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    return binary


def _polygon_area_sq_km(geometry) -> float:
    """Approximate geodesic area of a lon/lat polygon.

    Equal-area projection centred on the polygon itself, rather than treating
    degrees as a flat plane — at 40 degrees north a degree of longitude is about
    0.77 of a degree of latitude, so the naive version overstates area badly.
    """
    import pyproj
    from shapely.ops import transform as shapely_transform

    centroid = geometry.centroid
    projection = pyproj.Proj(
        proj="aea", lat_1=centroid.y - 5, lat_2=centroid.y + 5,
        lat_0=centroid.y, lon_0=centroid.x,
    )
    projected = shapely_transform(
        lambda x, y, z=None: projection(x, y), geometry
    )
    return projected.area / 1e6


def _fallback_area_sq_km(pixel_count: int, pixel_size_m: float) -> float:
    return pixel_count * (pixel_size_m**2) / 1e6


def _orientation_deg(pixel_polygon) -> float | None:
    """Long-axis bearing of the minimum rotated rectangle, in degrees."""
    try:
        rectangle = pixel_polygon.minimum_rotated_rectangle
        coords = list(rectangle.exterior.coords)[:4]
        edges = [
            (
                np.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]),
                np.degrees(
                    np.arctan2(
                        coords[i + 1][1] - coords[i][1], coords[i + 1][0] - coords[i][0]
                    )
                ),
            )
            for i in range(3)
        ]
        _, angle = max(edges, key=lambda e: e[0])
        return float(angle % 180.0)
    except Exception:
        return None


def _min_pixels(min_area_sq_km: float, pixel_size_m: float) -> int:
    """Area threshold in km2, converted to a pixel count for this GSD."""
    return max(1, int(min_area_sq_km * 1e6 / (pixel_size_m**2)))


def filter_small_components(
    binary: np.ndarray,
    min_area_sq_km: float = 0.01,
    pixel_size_m: float = DEFAULT_PIXEL_SIZE_M,
) -> np.ndarray:
    """Drop connected components under the area threshold.

    Split out of extract_slicks so this half of its filtering -- pure
    numpy/cv2, no coordinate transform involved -- can run on a bare class-map
    with no real geocoder available, e.g. inside evaluate.py/validate_visual.py,
    where the alternative would be scoring every single-pixel speckle as a
    genuine detection even though production would never report one.
    """
    import cv2

    if not binary.any():
        return binary
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        binary.astype(np.uint8), connectivity=8
    )
    min_pixels = _min_pixels(min_area_sq_km, pixel_size_m)
    keep = np.zeros_like(binary, dtype=np.uint8)
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] >= min_pixels:
            keep[labels == label] = 1
    return keep


def clean_and_filter(
    class_map: np.ndarray,
    min_area_sq_km: float = 0.01,
    pixel_size_m: float = DEFAULT_PIXEL_SIZE_M,
    target_class: int = OIL,
) -> np.ndarray:
    """clean_mask + filter_small_components: the geocoding-free subset of what
    production's extract_slicks does to a raw prediction. This is what a
    caller without a real coordinate transform (evaluation, validation) should
    call to report "as production would actually flag it" numbers alongside
    the raw per-pixel ones, rather than only ever seeing the harsher raw score.
    """
    return filter_small_components(
        clean_mask(class_map, target_class), min_area_sq_km, pixel_size_m
    )


def extract_slicks(
    class_map: np.ndarray,
    to_lonlat,
    min_area_sq_km: float = 0.01,
    pixel_size_m: float = DEFAULT_PIXEL_SIZE_M,
    target_class: int = OIL,
) -> list[SlickCandidate]:
    """Vectorise the predicted oil class into geocoded polygons."""
    import cv2
    import rasterio.features

    binary = clean_mask(class_map, target_class)
    if not binary.any():
        logger.info("No %s pixels survived cleanup", target_class)
        return []

    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    min_pixels = _min_pixels(min_area_sq_km, pixel_size_m)
    logger.info(
        "%d connected components; keeping those over %d px (%.3f km2)",
        count - 1, min_pixels, min_area_sq_km,
    )

    candidates: list[SlickCandidate] = []

    for label in range(1, count):
        pixel_count = int(stats[label, cv2.CC_STAT_AREA])
        if pixel_count < min_pixels:
            continue

        component = (labels == label).astype(np.uint8)
        shapes = list(rasterio.features.shapes(component, mask=component.astype(bool)))
        polygons = [shape(geom) for geom, value in shapes if value == 1]
        if not polygons:
            continue

        pixel_geometry = unary_union(polygons)
        if isinstance(pixel_geometry, Polygon):
            pixel_geometry = MultiPolygon([pixel_geometry])

        # Simplify in pixel space before geocoding: raster-traced boundaries are
        # staircases with a vertex per pixel edge, and interpolating every one of
        # those through the tie-point grid is pure cost for no added fidelity.
        simplified = pixel_geometry.simplify(1.5, preserve_topology=True)

        def pixel_to_lonlat(x, y, z=None):
            lon, lat = to_lonlat(np.asarray(x), np.asarray(y))
            return lon, lat

        try:
            geographic = transform(pixel_to_lonlat, simplified)
        except Exception as exc:
            logger.warning("Geocoding failed for component %d: %s", label, exc)
            continue

        if isinstance(geographic, Polygon):
            geographic = MultiPolygon([geographic])
        if not geographic.is_valid:
            geographic = geographic.buffer(0)
            if isinstance(geographic, Polygon):
                geographic = MultiPolygon([geographic])

        try:
            area_sq_km = _polygon_area_sq_km(geographic)
        except Exception:
            area_sq_km = _fallback_area_sq_km(pixel_count, pixel_size_m)

        candidates.append(
            SlickCandidate(
                geometry=geographic,
                pixel_geometry=simplified,
                area_sq_km=area_sq_km,
                orientation_deg=_orientation_deg(simplified),
                # Placeholder: replaced with the model's own mean probability
                # over this component once probability output is threaded
                # through. Kept explicit rather than invented.
                confidence=1.0,
                pixel_mask=component.astype(bool),
            )
        )

    logger.info("Extracted %d slick candidate(s)", len(candidates))
    return candidates
