"""Reads a Sentinel-1 SAFE product: calibration LUT and geolocation grid.

Two jobs, both essential and both easy to skip by accident:

1. **Calibration.** A downloaded GRD product holds raw digital numbers, not
   calibrated backscatter. The model is trained on Sigma0 in dB, so feeding raw
   DN in would be badly out of distribution — the model would still emit
   confident-looking masks, they would just be wrong. Nothing downstream can
   detect that, which is what makes it dangerous.

2. **Georeferencing.** The mask comes out in pixel coordinates. OpenDrift needs
   real longitude and latitude to backtrack anything, so the polygons have to be
   geocoded before they are worth storing.

Both live in the product's own annotation XML, as sparse grids interpolated up
to full resolution. Neither is available from the CDSE catalogue metadata that
`app.ingest.cdse` stores, so this has to open the downloaded product itself.

Deliberately not SNAP/snappy: too heavy to install, slow per scene, and a
fragile Python bridge. The tie-point interpolation below is accurate to within
metres, and everything downstream reasons in probability corridors, so metre-level
error is far below what matters here.
"""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GeoGridPoint:
    pixel: float
    line: float
    longitude: float
    latitude: float


@dataclass
class CalibrationGrid:
    lines: np.ndarray
    pixels: np.ndarray
    sigma_nought: np.ndarray  # (n_lines, n_pixels)


class SafeProductError(RuntimeError):
    pass


class SafeProduct:
    """A Sentinel-1 SAFE product, read from a .zip or an unpacked .SAFE dir."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._zip: zipfile.ZipFile | None = None
        if self.path.suffix.lower() == ".zip":
            self._zip = zipfile.ZipFile(self.path)
            self._names = self._zip.namelist()
        elif self.path.is_dir():
            self._names = [
                str(p.relative_to(self.path)).replace("\\", "/")
                for p in self.path.rglob("*")
                if p.is_file()
            ]
        else:
            raise SafeProductError(f"Not a SAFE product: {path}")

    def close(self) -> None:
        if self._zip is not None:
            self._zip.close()

    def __enter__(self) -> SafeProduct:
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def _read_bytes(self, name: str) -> bytes:
        if self._zip is not None:
            return self._zip.read(name)
        return (self.path / name).read_bytes()

    def _match(self, pattern: str) -> list[str]:
        regex = re.compile(pattern, re.IGNORECASE)
        return sorted(n for n in self._names if regex.search(n))

    def available_polarisations(self) -> list[str]:
        pols = set()
        for name in self._match(r"annotation/s1[ab]-.*\.xml$"):
            found = re.search(r"-(vv|vh|hh|hv)-", name, re.IGNORECASE)
            if found:
                pols.add(found.group(1).lower())
        return sorted(pols)

    def annotation_path(self, polarisation: str) -> str:
        matches = [
            n
            for n in self._match(r"annotation/s1[ab]-.*\.xml$")
            if f"-{polarisation.lower()}-" in n.lower() and "calibration" not in n.lower()
        ]
        if not matches:
            raise SafeProductError(f"No annotation XML for polarisation {polarisation!r}")
        return matches[0]

    def calibration_path(self, polarisation: str) -> str:
        matches = [
            n
            for n in self._match(r"annotation/calibration/calibration-.*\.xml$")
            if f"-{polarisation.lower()}-" in n.lower()
        ]
        if not matches:
            raise SafeProductError(f"No calibration XML for polarisation {polarisation!r}")
        return matches[0]

    def measurement_path(self, polarisation: str) -> str:
        matches = [
            n
            for n in self._match(r"measurement/s1[ab]-.*\.tiff?$")
            if f"-{polarisation.lower()}-" in n.lower()
        ]
        if not matches:
            raise SafeProductError(f"No measurement raster for polarisation {polarisation!r}")
        return matches[0]

    def read_geolocation_grid(self, polarisation: str) -> list[GeoGridPoint]:
        """Parse <geolocationGridPointList> from the annotation XML.

        Parsed by hand rather than through GDAL's SAFE driver, whose GCP
        exposure varies by driver version and build — a dependency worth not
        having for what is a dozen lines of ElementTree.
        """
        root = ET.fromstring(self._read_bytes(self.annotation_path(polarisation)))
        points = [
            GeoGridPoint(
                pixel=float(point.findtext("pixel", "0")),
                line=float(point.findtext("line", "0")),
                longitude=float(point.findtext("longitude", "0")),
                latitude=float(point.findtext("latitude", "0")),
            )
            for point in root.iter("geolocationGridPoint")
        ]
        if not points:
            raise SafeProductError("Annotation XML contained no geolocation grid points")
        logger.info("Parsed %d geolocation grid points", len(points))
        return points

    def read_calibration_grid(self, polarisation: str) -> CalibrationGrid:
        """Parse the sigmaNought LUT from the calibration XML."""
        root = ET.fromstring(self._read_bytes(self.calibration_path(polarisation)))

        lines: list[float] = []
        pixels_per_line: list[np.ndarray] = []
        sigma_per_line: list[np.ndarray] = []

        for vector in root.iter("calibrationVector"):
            lines.append(float(vector.findtext("line", "0")))
            pixels_per_line.append(
                np.fromstring(vector.findtext("pixel", ""), sep=" ", dtype=np.float64)
            )
            sigma_per_line.append(
                np.fromstring(vector.findtext("sigmaNought", ""), sep=" ", dtype=np.float64)
            )

        if not lines:
            raise SafeProductError("Calibration XML contained no calibration vectors")

        widths = {len(p) for p in pixels_per_line}
        if len(widths) != 1:
            raise SafeProductError(
                f"Ragged calibration vectors (widths {sorted(widths)}); cannot build a grid"
            )

        return CalibrationGrid(
            lines=np.asarray(lines),
            pixels=pixels_per_line[0],
            sigma_nought=np.vstack(sigma_per_line),
        )


def build_geocoder(points: list[GeoGridPoint]):
    """Return `to_lonlat(pixel, line) -> (lon, lat)` over the tie-point grid.

    Linear interpolation inside the grid's convex hull, nearest-neighbour
    outside it. The fallback matters: polygons touching the scene edge produce
    vertices marginally outside the hull, and linear interpolation returns NaN
    there — which would otherwise silently corrupt a polygon's geometry rather
    than fail loudly.
    """
    from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator

    coordinates = np.array([(p.pixel, p.line) for p in points])
    longitudes = np.array([p.longitude for p in points])
    latitudes = np.array([p.latitude for p in points])

    lon_linear = LinearNDInterpolator(coordinates, longitudes)
    lat_linear = LinearNDInterpolator(coordinates, latitudes)
    lon_nearest = NearestNDInterpolator(coordinates, longitudes)
    lat_nearest = NearestNDInterpolator(coordinates, latitudes)

    def to_lonlat(pixel, line):
        pixel = np.atleast_1d(np.asarray(pixel, dtype=np.float64))
        line = np.atleast_1d(np.asarray(line, dtype=np.float64))

        lon = lon_linear(pixel, line)
        lat = lat_linear(pixel, line)

        outside = np.isnan(lon) | np.isnan(lat)
        if np.any(outside):
            lon[outside] = lon_nearest(pixel[outside], line[outside])
            lat[outside] = lat_nearest(pixel[outside], line[outside])
        return lon, lat

    return to_lonlat


def build_sigma_nought_interpolator(grid: CalibrationGrid):
    """Return `sigma(pixel, line)` over the calibration LUT."""
    from scipy.interpolate import RegularGridInterpolator

    interpolator = RegularGridInterpolator(
        (grid.lines, grid.pixels),
        grid.sigma_nought,
        bounds_error=False,
        fill_value=None,  # extrapolate rather than NaN at raster edges
    )

    def sigma(pixel, line):
        pixel = np.asarray(pixel, dtype=np.float64)
        line = np.asarray(line, dtype=np.float64)
        return interpolator(np.stack([line, pixel], axis=-1))

    return sigma


def calibrate_to_db(
    digital_numbers: np.ndarray,
    sigma_interpolator,
    row_offset: int,
    col_offset: int,
) -> np.ndarray:
    """Convert a raw DN window to Sigma0 in dB.

    sigma0 = DN^2 / sigmaNought^2, then 10*log10.

    Offsets are required, not optional: the calibration LUT is indexed in
    full-raster coordinates, so a window read from the middle of a scene must
    say where it came from or it gets calibrated with the wrong LUT values.
    """
    rows, cols = digital_numbers.shape
    col_grid, row_grid = np.meshgrid(
        np.arange(cols) + col_offset,
        np.arange(rows) + row_offset,
    )
    sigma = sigma_interpolator(col_grid, row_grid)

    dn = digital_numbers.astype(np.float64)
    with np.errstate(divide="ignore", invalid="ignore"):
        sigma0 = (dn**2) / np.clip(sigma, 1e-6, None) ** 2
        db = 10.0 * np.log10(np.clip(sigma0, 1e-12, None))

    # Zero-DN pixels are no-data, not "infinitely dark sea"; clamping keeps them
    # from dragging the normalisation range in the tile they land in.
    return np.nan_to_num(db, nan=-40.0, neginf=-40.0, posinf=0.0)
