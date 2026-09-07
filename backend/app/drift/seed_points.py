"""Stage 4b: convert one detected slick polygon into starting points for the
backward drift ensemble.

Grid, not random sampling: seed points feed a probability heatmap, and even,
unbiased spatial coverage matters more here than randomness, which could bias
the resulting surface toward oversampled regions.
"""
from __future__ import annotations

import math

from shapely.geometry import Point, Polygon

DEFAULT_TARGET_RANGE = (30, 150)
MIN_FALLBACK_POINTS = 10


def generate_seed_points(
    polygon: Polygon, target_range: tuple[int, int] = DEFAULT_TARGET_RANGE
) -> list[Point]:
    """Adaptive grid over polygon.bounds, filtered to points actually inside
    the (possibly irregular/fragmented) polygon shape.

    Spacing is solved from the bounding box area to land in target_range
    rather than using a fixed constant, since a fixed spacing risks far too
    many points on a large spill or too few on a thin, fragmented one.
    """
    min_lon, min_lat, max_lon, max_lat = polygon.bounds
    width, height = max_lon - min_lon, max_lat - min_lat
    target_mid = sum(target_range) / 2

    spacing = math.sqrt((width * height) / target_mid) if width and height else 0
    points = _grid_filter(polygon, min_lon, min_lat, max_lon, max_lat, spacing) if spacing else []

    # Narrow the spacing until we're in range, or give up and fall back.
    attempts = 0
    while len(points) < target_range[0] and attempts < 8:
        spacing /= 1.6
        points = _grid_filter(polygon, min_lon, min_lat, max_lon, max_lat, spacing)
        attempts += 1

    if len(points) < MIN_FALLBACK_POINTS:
        # Thin/fragmented polygon: seed along the boundary and centroid
        # instead of failing Step 5 with too few (or zero) starting points.
        points = _fallback_points(polygon)

    return points


def _grid_filter(
    polygon: Polygon, min_lon: float, min_lat: float, max_lon: float, max_lat: float,
    spacing: float,
) -> list[Point]:
    points = []
    lon = min_lon
    while lon <= max_lon:
        lat = min_lat
        while lat <= max_lat:
            p = Point(lon, lat)
            if polygon.contains(p):
                points.append(p)
            lat += spacing
        lon += spacing
    return points


def _fallback_points(polygon: Polygon) -> list[Point]:
    points = [polygon.centroid]
    boundary = polygon.exterior
    length = boundary.length
    if length > 0:
        n = max(MIN_FALLBACK_POINTS - 1, 4)
        points += [boundary.interpolate(i / n, normalized=True) for i in range(n)]
    return points
