"""Local-contrast (CFAR-style) channels: relative darkness, not absolute level.

The segmentation model was shown to depend on absolute SAR backscatter level
rather than local contrast (see the domain-shift-sweep results and the
controlled dB-offset experiment that motivated this module) -- real Sentinel-1
water reads far brighter than this project's training distribution, and a
model keyed on absolute dB collapses completely once deployed on it.

A windowed z-score is exactly invariant to a uniform additive offset by
construction: shifting a whole neighbourhood's mean shifts both the pixel and
its local mean identically, cancelling in the numerator, while the local
standard deviation is unaffected by a constant shift altogether. Adding this
as extra model input channels, alongside the existing VV/VH dB channels
(not replacing them -- absolute level is still real information, just not
sufficient on its own), gives the network a second, shift-invariant signal to
fall back on.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path

import numpy as np
from scipy import ndimage

from app.ml.classes import DB_MAX, DB_MIN, Z_MAX, Z_MIN
from app.ml.data_prep import _normalise_channels

logger = logging.getLogger(__name__)

DEFAULT_WINDOW = 15
DEFAULT_EPS = 1e-3


def local_contrast_channels(
    db_stack: np.ndarray, window: int = DEFAULT_WINDOW, eps: float = DEFAULT_EPS
) -> np.ndarray:
    """Per-channel windowed z-score: (pixel - local mean) / (local std + eps).

    db_stack is (H, W, C) calibrated dB (or any additively-shifted variant of
    it -- the transform is invariant to that shift). Returns an array of the
    same shape, one z-score channel per input channel.
    """
    channels = []
    for c in range(db_stack.shape[-1]):
        chan = db_stack[..., c]
        mean = ndimage.uniform_filter(chan, size=window)
        sqmean = ndimage.uniform_filter(chan**2, size=window)
        var = np.clip(sqmean - mean**2, 0, None)
        std = np.sqrt(var)
        channels.append((chan - mean) / (std + eps))
    return np.stack(channels, axis=-1).astype(np.float32)


def normalise_contrast_channels(z_stack: np.ndarray) -> np.ndarray:
    """Scale local z-scores into [0, 1] against a fixed empirical range.

    Z_MIN/Z_MAX were measured directly from this project's training tiles
    (local z-score distribution: mean ~0, std ~0.93, 99.9th percentile ~2.85,
    observed range roughly [-4.8, 5.7]) -- not guessed by analogy to DB_MIN/
    DB_MAX. +-4.0 covers the great majority of that range, including most of
    the informative oil/sea-edge extremes, while still bounding it.
    """
    return np.clip((z_stack - Z_MIN) / (Z_MAX - Z_MIN), 0.0, 1.0)


def build_model_input(db_stack: np.ndarray, use_contrast_channels: bool, window: int = DEFAULT_WINDOW) -> np.ndarray:
    """Single choke point for channel composition, used identically by both
    training-tile preparation and inference -- so channel order and semantics
    can never silently diverge between the two, the same reasoning behind
    evaluate._predict_full_image matching inference.infer_scene's tiling.

    Fixed channel order: [pol_0_db, pol_1_db, ..., pol_0_contrast, pol_1_contrast, ...].
    """
    normalised = _normalise_channels(db_stack)
    if not use_contrast_channels:
        return normalised
    contrast = normalise_contrast_channels(local_contrast_channels(db_stack, window=window))
    return np.concatenate([normalised, contrast], axis=-1)


def _migrate_one_tile(job: tuple[str, str, str, str, int]) -> None:
    """Worker for migrate_tiles_add_contrast -- module-level and picklable so
    ProcessPoolExecutor can dispatch it, matching data_prep.cut_tiles's pattern."""
    image_rel, mask_rel, tiles_dir_str, out_dir_str, window = job
    tiles_dir, out_dir = Path(tiles_dir_str), Path(out_dir_str)
    out_image_path, out_mask_path = out_dir / image_rel, out_dir / mask_rel

    # Resumable: an interrupted migration continues rather than starting over,
    # matching cut_tiles's convention for the same reason (this is a
    # multi-hour-scale job across 164k tiles).
    if out_image_path.exists() and out_mask_path.exists():
        return

    out_image_path.parent.mkdir(parents=True, exist_ok=True)
    image = np.load(tiles_dir / image_rel).astype(np.float32)  # stored [0,1]-normalised, 2-channel
    db = image * (DB_MAX - DB_MIN) + DB_MIN  # exact inverse of _normalise_channels
    four_channel = build_model_input(db, use_contrast_channels=True, window=window).astype(np.float16)
    np.save(out_image_path, four_channel)
    shutil.copy2(tiles_dir / mask_rel, out_mask_path)


def migrate_tiles_add_contrast(
    tiles_dir: Path,
    out_dir: Path,
    window: int = DEFAULT_WINDOW,
    lookalike_fp_source: Path | None = None,
    workers: int | None = None,
) -> dict[str, int]:
    """Produce a 4-channel (VV/VH + local-contrast) mirror of an existing
    2-channel tiles directory, without needing the original raw archives.

    Existing tiles are stored already normalised to [0,1] (see
    data_prep._normalise_channels); denormalising back to dB is lossless
    except at the clipped extremes, an accepted minor precision loss. Both
    this path and any future from-scratch tiling run share the exact same
    build_model_input choke point, so channel semantics can never diverge
    between them.

    lookalike_fp_source lets the migrated directory carry a specific prior
    mining state (e.g. the one that produced remined3) rather than whatever
    happens to be the current tile_lookalike_fp.json -- keeping an isolated
    A/B comparison to a single changed variable (channels), not two.
    """
    from concurrent.futures import ProcessPoolExecutor, as_completed

    if workers is None:
        workers = max(1, min(12, (os.cpu_count() or 4) - 2))

    manifest = json.loads((tiles_dir / "manifest.json").read_text())
    jobs = [
        (entry["image"], entry["mask"], str(tiles_dir), str(out_dir), window)
        for entries in manifest.values()
        for entry in entries
    ]
    logger.info("Migrating %d tiles across %d workers", len(jobs), workers)

    done = 0
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_migrate_one_tile, job) for job in jobs]
        for future in as_completed(futures):
            future.result()  # surface any worker exception immediately
            done += 1
            if done % 5000 == 0:
                logger.info("%d/%d tiles migrated", done, len(jobs))

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    oil_fraction_src = tiles_dir / "tile_oil_fraction.json"
    if oil_fraction_src.exists():
        shutil.copy2(oil_fraction_src, out_dir / "tile_oil_fraction.json")

    lookalike_src = lookalike_fp_source or (tiles_dir / "tile_lookalike_fp.json")
    if lookalike_src.exists():
        shutil.copy2(lookalike_src, out_dir / "tile_lookalike_fp.json")
        logger.info("Copied hard-negative mining state from %s", lookalike_src)

    counts = {split: len(entries) for split, entries in manifest.items()}
    logger.info("Migration complete: %s", counts)
    return counts
