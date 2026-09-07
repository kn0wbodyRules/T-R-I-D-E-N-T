"""Tiled sliding-window inference over a full Sentinel-1 scene."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch

from app.config import get_settings
from app.ml.data_prep import _nodata_mask
from app.ml.dataset import NUM_POLARISATIONS, SEA
from app.ml.model import build_model
from app.ml.radiometric import build_model_input
from app.ml.sar_product import (
    SafeProduct,
    build_geocoder,
    build_sigma_nought_interpolator,
    calibrate_to_db,
)

logger = logging.getLogger(__name__)

# Preferred polarisation order. VV carries the stronger ocean-surface signal for
# slick detection than VH, so it leads.
POLARISATION_PREFERENCE = ("vv", "vh", "hh", "hv")


@dataclass
class SceneInference:
    class_map: np.ndarray  # (H, W) uint8 of class indices
    backscatter_db: np.ndarray  # (H, W) float32, VV in dB — feeds the age heuristic
    to_lonlat: object
    model_version: str
    shape: tuple[int, int]
    stats: dict = field(default_factory=dict)


def load_checkpoint(checkpoint_path: Path, device: torch.device):
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    config = checkpoint.get("config", {})
    # num_channels defaults to NUM_POLARISATIONS (2) for checkpoints saved
    # before this field existed -- every one of them is a plain VV/VH model,
    # so that default recovers their true channel count rather than guessing.
    in_channels = config.get("num_channels", NUM_POLARISATIONS)
    model = build_model(
        encoder=config.get("encoder", "resnet34"), pretrained=False, in_channels=in_channels
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device).eval()
    version = config.get("version") or checkpoint_path.stem
    return model, version, config


def _select_polarisations(available: list[str]) -> list[str]:
    """Pick the physical polarisations to stack, matching the training channel
    order. Always NUM_POLARISATIONS (2) regardless of a model's total input
    width -- a model with local-contrast channels still reads only 2 physical
    polarisations, deriving the rest from them (see radiometric.py)."""
    ordered = [p for p in POLARISATION_PREFERENCE if p in available]
    if not ordered:
        raise RuntimeError(f"No usable polarisation in product (saw {available})")
    if len(ordered) == 1:
        # Duplicating the single available band keeps the tensor shape valid.
        # It is a degraded input, not an equivalent one, so say so loudly.
        logger.warning(
            "Only %s available; duplicating it to fill both input channels. "
            "Detection quality will be below a true dual-pol scene.",
            ordered[0],
        )
        return [ordered[0], ordered[0]]
    return ordered[:NUM_POLARISATIONS]


def read_backscatter(product_path: Path) -> tuple[np.ndarray, object, tuple[int, int]]:
    """Real calibrated VV backscatter (dB) for a whole scene, without running
    the segmentation model.

    Added for Step 6b (CFAR dark-vessel detection), which only needs this raw
    calibrated array, never oil/sea classification -- running the full deep
    model across every tile just to discard its output was costing ~3-4
    minutes of real GPU inference per attribution run for no benefit. Reuses
    the exact same read+calibrate path infer_scene uses (SafeProduct,
    calibrate_to_db), so values are identical to what infer_scene's
    backscatter_db would have been; only the model pass is skipped. VV only
    (index 0 of _select_polarisations), since detect_ships_cfar only ever
    used VV anyway.
    """
    import rasterio
    from rasterio.windows import Window

    settings = get_settings()
    tile_size = settings.ml_tile_size

    with SafeProduct(product_path) as product:
        polarisations = _select_polarisations(product.available_polarisations())
        geo_points = product.read_geolocation_grid(polarisations[0])
        to_lonlat = build_geocoder(geo_points)
        sigma_interpolator = build_sigma_nought_interpolator(
            product.read_calibration_grid(polarisations[0])
        )

        measurement = product.measurement_path(polarisations[0])
        uri = (
            f"zip://{product.path}!/{measurement}"
            if product.path.suffix.lower() == ".zip"
            else str(product.path / measurement)
        )
        with rasterio.open(uri) as handle:
            height, width = handle.height, handle.width
            backscatter = np.zeros((height, width), dtype=np.float32)
            for row in range(0, height, tile_size):
                for col in range(0, width, tile_size):
                    tile_h = min(tile_size, height - row)
                    tile_w = min(tile_size, width - col)
                    window = Window(col, row, tile_w, tile_h)
                    raw = handle.read(1, window=window)
                    backscatter[row : row + tile_h, col : col + tile_w] = calibrate_to_db(
                        raw, sigma_interpolator, row, col
                    )
    return backscatter, to_lonlat, (height, width)


@torch.no_grad()
def infer_scene(
    product_path: Path,
    checkpoint_path: Path,
    batch_size: int = 8,
    device: torch.device | None = None,
) -> SceneInference:
    """Run the segmentation model across an entire SAFE product.

    A full IW GRD scene is roughly 25000x17000 pixels. Two consequences shape
    this code: the raster is read in windows rather than loaded whole, and each
    tile is reduced to class indices immediately, because keeping float32
    per-class probabilities for a scene that size would need gigabytes of RAM to
    hold something that is thrown away moments later.
    """
    import rasterio
    from rasterio.windows import Window

    settings = get_settings()
    tile_size = settings.ml_tile_size
    overlap = settings.ml_tile_overlap
    stride = tile_size - overlap
    trim = overlap // 2

    device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, model_version, model_config = load_checkpoint(checkpoint_path, device)
    use_contrast_channels = model_config.get("num_channels", NUM_POLARISATIONS) > NUM_POLARISATIONS

    with SafeProduct(product_path) as product:
        polarisations = _select_polarisations(product.available_polarisations())
        logger.info("Using polarisations %s", polarisations)

        geo_points = product.read_geolocation_grid(polarisations[0])
        to_lonlat = build_geocoder(geo_points)

        sigma_interpolators = [
            build_sigma_nought_interpolator(product.read_calibration_grid(pol))
            for pol in polarisations
        ]

        # rasterio can address a file inside a zip directly, avoiding a full
        # multi-GB extraction just to read windows out of it.
        def raster_uri(pol: str) -> str:
            measurement = product.measurement_path(pol)
            if product.path.suffix.lower() == ".zip":
                return f"zip://{product.path}!/{measurement}"
            return str(product.path / measurement)

        handles = [rasterio.open(raster_uri(pol)) for pol in polarisations]
        try:
            height, width = handles[0].height, handles[0].width
            logger.info("Scene raster: %d x %d", width, height)

            class_map = np.zeros((height, width), dtype=np.uint8)
            backscatter = np.zeros((height, width), dtype=np.float32)
            # A real scene is delivered as an axis-aligned rectangle around a
            # rotated swath, so its corners are padding, not an observation --
            # same fill sentinel the training data carries (see
            # data_prep._nodata_mask). The model was never taught a positive
            # signal for that padding (no-data pixels are excluded from the
            # loss entirely, not pushed toward "sea"), so nothing guarantees
            # its raw prediction there is harmless; this force-overrides it to
            # sea after the fact rather than trusting an out-of-distribution
            # guess.
            nodata_map = np.zeros((height, width), dtype=bool)

            windows: list[tuple[int, int]] = [
                (row, col)
                for row in range(0, max(height - overlap, 1), stride)
                for col in range(0, max(width - overlap, 1), stride)
            ]
            logger.info("Running %d tiles at batch size %d", len(windows), batch_size)

            batch: list[np.ndarray] = []
            positions: list[tuple[int, int]] = []

            def flush() -> None:
                if not batch:
                    return
                tensor = torch.from_numpy(np.stack(batch)).to(device)
                with torch.autocast(device_type=device.type, dtype=torch.float16):
                    logits = model(tensor)
                predictions = logits.argmax(dim=1).to(torch.uint8).cpu().numpy()

                for (row, col), prediction in zip(positions, predictions):
                    tile_h = min(tile_size, height - row)
                    tile_w = min(tile_size, width - col)

                    # Trim each tile's border before pasting: predictions near a
                    # tile edge are made without the surrounding context the
                    # convolutions want, so the overlap exists precisely to let
                    # a neighbouring tile's better-informed centre cover it.
                    top = trim if row > 0 else 0
                    left = trim if col > 0 else 0
                    bottom = tile_h - trim if row + tile_size < height else tile_h
                    right = tile_w - trim if col + tile_size < width else tile_w

                    class_map[row + top : row + bottom, col + left : col + right] = (
                        prediction[top:bottom, left:right]
                    )
                batch.clear()
                positions.clear()

            for row, col in windows:
                tile_h = min(tile_size, height - row)
                tile_w = min(tile_size, width - col)
                if tile_h < 16 or tile_w < 16:
                    continue

                window = Window(col, row, tile_w, tile_h)
                channels = []
                for handle, sigma in zip(handles, sigma_interpolators):
                    raw = handle.read(1, window=window)
                    channels.append(calibrate_to_db(raw, sigma, row, col))

                stacked = np.stack(channels, axis=-1).astype(np.float32)
                backscatter[row : row + tile_h, col : col + tile_w] = stacked[..., 0]
                nodata_map[row : row + tile_h, col : col + tile_w] = _nodata_mask(stacked)

                if tile_h != tile_size or tile_w != tile_size:
                    # NUM_POLARISATIONS, not the model's total input width --
                    # this pads the raw calibrated-dB stack before contrast
                    # channels (if any) are derived from it below.
                    padded = np.zeros((tile_size, tile_size, NUM_POLARISATIONS), np.float32)
                    padded[:tile_h, :tile_w] = stacked
                    stacked = padded

                model_input = build_model_input(stacked, use_contrast_channels=use_contrast_channels)
                batch.append(np.ascontiguousarray(model_input.transpose(2, 0, 1)))
                positions.append((row, col))

                if len(batch) >= batch_size:
                    flush()
            flush()
            class_map[nodata_map] = SEA
        finally:
            for handle in handles:
                handle.close()

    return SceneInference(
        class_map=class_map,
        backscatter_db=backscatter,
        to_lonlat=to_lonlat,
        model_version=model_version,
        shape=(height, width),
        stats={"tiles": len(windows), "polarisations": polarisations},
    )
