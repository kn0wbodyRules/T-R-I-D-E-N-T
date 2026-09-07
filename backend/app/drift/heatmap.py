"""Stage 5b: endpoint cloud -> probability surface -> polygon(s), to fit
DriftEstimate.origin_polygon (a region, not a point -- the forcing data
itself is uncertain, and a single backtracked coordinate would imply
precision that doesn't exist).

Deliberately avoids matplotlib/scikit-image contouring (neither is a project
dependency, and pulling either in just for this would be a heavier addition
than the problem needs): KDE density is evaluated at each endpoint itself,
the denser half of the cloud is kept, and its convex hull becomes the origin
region. A convex hull loses some shape fidelity versus a true iso-density
contour, but is robust, dependency-free, and an honest, standard way to
represent an ensemble's likely-origin region.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import gaussian_kde
from shapely.geometry import MultiPoint, MultiPolygon, Point, Polygon


def build_origin_heatmap(
    endpoints: list[tuple[float, float]],
    density_percentile: float = 50.0,
) -> tuple[MultiPolygon, tuple[float, float]]:
    """KDE density at each endpoint; keep the denser half (or whatever
    percentile), take their convex hull as origin_polygon. Returns
    (origin_polygon, centroid_lonlat)."""
    lons = np.array([p[0] for p in endpoints])
    lats = np.array([p[1] for p in endpoints])

    if len(endpoints) < 4:
        # Too few points for a meaningful KDE/hull -- fall back to a small
        # buffer around the mean rather than failing outright.
        centroid = (float(lons.mean()), float(lats.mean()))
        poly = Point(centroid).buffer(0.01)
        return MultiPolygon([poly]), centroid

    kde = gaussian_kde(np.vstack([lons, lats]))
    density = kde(np.vstack([lons, lats]))
    threshold = np.percentile(density, density_percentile)
    kept = density >= threshold

    hull = MultiPoint(list(zip(lons[kept], lats[kept]))).convex_hull
    if isinstance(hull, Point):
        hull = hull.buffer(0.01)
    if not isinstance(hull, Polygon):
        # A degenerate (collinear) set of kept points can produce a
        # LineString hull instead of a Polygon -- buffer it into one rather
        # than store an invalid geometry for a POLYGON-typed column.
        hull = hull.buffer(0.005)

    origin_polygon = MultiPolygon([hull])
    centroid = origin_polygon.centroid
    return origin_polygon, (centroid.x, centroid.y)
