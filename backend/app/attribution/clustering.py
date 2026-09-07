"""Stage 8a: ST-DBSCAN (spatiotemporal DBSCAN) route clustering.

Real, published maritime-anomaly-detection technique (verified via search
earlier this build, not assumed) -- adds a time radius alongside DBSCAN's
spatial one, so two points only count as neighbours if they are close in
BOTH space and time. Implemented here via sklearn's plain DBSCAN with a
precomputed distance matrix built as max(spatial_dist/eps_km,
temporal_dist/eps_hours): thresholding that combined value at 1.0 exactly
reproduces "both individual thresholds must hold," which is the standard way
ST-DBSCAN is built on top of a metric-agnostic DBSCAN implementation.

Why this catches something Isolation Forest (already used elsewhere in this
project) does not: Isolation Forest flags a vessel whose own statistics look
unusual (an odd speed drop, an erratic turn) but says nothing about whether
its *route* is one any other vessel ever takes. A vessel moving at a
completely normal, steady speed on a route nothing else uses is invisible to
a per-vessel statistical test but stands out immediately here as unclustered
noise -- the two methods cover different blind spots, not the same one twice.
"""
from __future__ import annotations

import math
from datetime import datetime

import numpy as np

DEFAULT_EPS_KM = 5.0
DEFAULT_EPS_HOURS = 3.0
DEFAULT_MIN_SAMPLES = 5


def _haversine_km(lon1, lat1, lon2, lat2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _st_distance_matrix(
    points: list[tuple[float, float]], times: list[datetime], eps_km: float, eps_hours: float,
) -> np.ndarray:
    n = len(points)
    dist = np.zeros((n, n), dtype=np.float64)
    for i in range(n):
        for j in range(i + 1, n):
            spatial = _haversine_km(points[i][0], points[i][1], points[j][0], points[j][1])
            temporal = abs((times[i] - times[j]).total_seconds()) / 3600.0
            combined = max(spatial / eps_km, temporal / eps_hours)
            dist[i, j] = dist[j, i] = combined
    return dist


def cluster_deviation_score(
    candidate_positions: list[tuple[datetime, float, float]],
    background_positions: list[tuple[datetime, float, float]],
    eps_km: float = DEFAULT_EPS_KM,
    eps_hours: float = DEFAULT_EPS_HOURS,
    min_samples: int = DEFAULT_MIN_SAMPLES,
) -> float:
    """Fit ST-DBSCAN on background traffic + this one candidate's positions
    together, so the candidate can register as a genuine outlier against
    real established clusters rather than trivially forming its own.

    Returns the fraction of the candidate's own points labelled noise (-1):
    0.0 = every position fits an established normal-traffic cluster, 1.0 =
    the whole track is outside any recognised route. candidate_positions/
    background_positions are (ts, lon, lat) tuples.
    """
    from sklearn.cluster import DBSCAN

    if not candidate_positions:
        return 0.5  # no data to judge -- neither confirms nor denies normalcy

    all_positions = background_positions + candidate_positions
    times = [p[0] for p in all_positions]
    points = [(p[1], p[2]) for p in all_positions]

    dist = _st_distance_matrix(points, times, eps_km, eps_hours)
    labels = DBSCAN(eps=1.0, min_samples=min_samples, metric="precomputed").fit_predict(dist)

    candidate_labels = labels[len(background_positions):]
    noise_fraction = float(np.mean(candidate_labels == -1))
    return noise_fraction
