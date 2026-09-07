"""Archive extraction and offline tiling of the Zenodo / refined-SOS datasets.

Run once, before training. Produces `.npy` tiles plus a `manifest.json` that
records the train/val split.

The archives' internal directory layout is not documented anywhere, so file
discovery here is deliberately structural rather than hardcoded: walk the
extracted tree, classify by path, and pair images to masks by the numeric id
embedded in their filenames.
"""

from __future__ import annotations

import json
import logging
import os
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.ml.classes import (
    CATEGORY_FOREGROUND,
    DB_MAX,
    DB_MIN,
    IGNORE_INDEX,
    SEA,
    TRAINING_CATEGORIES,
)

logger = logging.getLogger(__name__)

IMAGE_SUFFIXES = {".tif", ".tiff", ".png", ".jpg", ".jpeg", ".npy"}

# archive filename -> (category, kind)
ARCHIVE_MAP = {
    "01_Train_Val_Oil_Spill_images.7z": ("part1_oil", "images"),
    "01_Train_Val_Oil_Spill_mask.7z": ("part1_oil", "masks"),
    "01_Train_Val_Lookalike_images.7z": ("part2_lookalike", "images"),
    "01_Train_Val_Lookalike_mask.7z": ("part2_lookalike", "masks"),
    "01_Train_Val_No_Oil_Images.7z": ("part2_nooil", "images"),
    "01_Train_Val_No_Oil_mask.7z": ("part2_nooil", "masks"),
    "02_Test_images_and_ground_truth.7z": ("part3_test", "both"),
    "images.zip": ("refined_sos", "images"),
    "masks.zip": ("refined_sos", "masks"),
}

VAL_FRACTION = 0.15
# Fixed so a re-run reproduces the same split; a shifting split would silently
# leak previously-validated images into training on the next run.
SPLIT_SEED = 26143


@dataclass
class SourcePair:
    image: Path
    mask: Path
    category: str


def extract_archives(archive_dir: Path, raw_dir: Path) -> dict[str, int]:
    """Extract every known archive into raw_dir/<category>/<kind>/."""
    import py7zr

    stats = {"extracted": 0, "skipped": 0, "missing": 0}

    for name, (category, kind) in ARCHIVE_MAP.items():
        # Archives sit in per-dataset subfolders (zenodo-oilspill-part1-oil/...),
        # so search rather than assuming they are flat in archive_dir.
        source = archive_dir / name
        if not source.exists():
            found = [p for p in archive_dir.rglob(name) if p.is_file()]
            source = found[0] if found else None

        if source is None:
            logger.info("Archive not present, skipping: %s", name)
            stats["missing"] += 1
            continue

        target = raw_dir / category / (kind if kind != "both" else "")
        if target.exists() and any(target.iterdir()):
            logger.info("Already extracted, skipping: %s", name)
            stats["skipped"] += 1
            continue

        target.mkdir(parents=True, exist_ok=True)
        logger.info("Extracting %s -> %s", name, target)

        if source.suffix == ".zip":
            with zipfile.ZipFile(source) as archive:
                archive.extractall(target)
        else:
            with py7zr.SevenZipFile(source, mode="r") as archive:
                archive.extractall(target)
        stats["extracted"] += 1

    return stats


def _numeric_key(path: Path) -> str | None:
    """Pull the sample id out of a filename.

    Zenodo pairs an image with its mask by a shared number ("0001"), not by an
    identical filename, so matching on stem alone would pair nothing.
    """
    matches = re.findall(r"\d+", path.stem)
    return matches[-1].lstrip("0") or "0" if matches else None


def _is_junk(path: Path) -> bool:
    """Archive noise that must never reach the dataset.

    These archives were built on macOS, so they carry an `__MACOSX/` tree of
    AppleDouble resource forks. The trap is that those stubs mirror the real
    filenames — `._palsar_0.png` sits beside `palsar_0.png` and matches an image
    extension — so a naive suffix filter admits thousands of 200-byte binary
    files as training images. They would not fail loudly either: the numeric-key
    pairing would happily match them to real masks.
    """
    return (
        path.name.startswith("._")
        or "__MACOSX" in path.parts
        or path.name == ".DS_Store"
        or path.name.startswith(".")
    )


def _find_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        p
        for p in root.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES and not _is_junk(p)
    )


def _group_key(path: Path) -> str:
    """The split subdirectory a file sits in, if any.

    Refined-SOS ships its own train/ and val/ subdirectories, and the same
    sample number appears in both. Pairing has to stay inside one of them or an
    image from train can be matched to a mask from val.
    """
    for part in reversed(path.parts[:-1]):
        if part.lower() in {"train", "val", "test", "validation"}:
            return part.lower()
    return ""


def _pair_files(
    images: list[Path],
    masks: list[Path],
    category: str,
    out: list[SourcePair],
) -> tuple[int, int]:
    """Pair images to masks, preferring exact names over numeric ids.

    Two datasets, two conventions, and conflating them corrupts labels silently:

    - Refined-SOS names an image and its mask identically (`palsar_0.png` in
      both trees) but carries two families, palsar_ and sentinel_, that reuse the
      same numbers. Pairing on the number alone hands `sentinel_5` the mask
      belonging to `palsar_5` — 3,101 such collisions in this dataset.
    - Zenodo names them differently (`..._0042.tif` against `mask_0042.tif`) and
      shares only the trailing number, so exact-name matching finds nothing.

    So: exact stem first, numeric id only as a fallback, and both scoped to the
    same train/val subdirectory. An image that stays unmatched is dropped rather
    than guessed at.
    """
    by_stem: dict[tuple[str, str], Path] = {}
    by_number: dict[tuple[str, str], list[Path]] = {}

    for mask in masks:
        group = _group_key(mask)
        by_stem.setdefault((group, mask.stem.lower()), mask)
        number = _numeric_key(mask)
        if number is not None:
            by_number.setdefault((group, number), []).append(mask)

    matched = 0
    unpairable = 0

    for image in images:
        group = _group_key(image)

        mask = by_stem.get((group, image.stem.lower()))

        if mask is None:
            number = _numeric_key(image)
            candidates = by_number.get((group, number), []) if number else []
            if len(candidates) == 1:
                mask = candidates[0]
            elif len(candidates) > 1:
                # Several masks share this number in this group, so the pairing
                # is genuinely ambiguous. Dropping the sample costs one training
                # example; guessing risks training on a wrong label.
                unpairable += 1
                continue

        if mask is None:
            unpairable += 1
            continue

        out.append(SourcePair(image=image, mask=mask, category=category))
        matched += 1

    return matched, unpairable


def discover_pairs(raw_dir: Path) -> list[SourcePair]:
    """Pair every extracted image with its mask, per category."""
    pairs: list[SourcePair] = []

    for category in CATEGORY_FOREGROUND:
        category_dir = raw_dir / category
        if not category_dir.exists():
            continue

        images = _find_files(category_dir / "images")
        masks = _find_files(category_dir / "masks")

        # Part III (and anything else packaged as one archive) has no
        # images/masks split at the top level, so fall back to classifying by
        # where "mask" appears anywhere in the path.
        if not images and not masks:
            everything = _find_files(category_dir)
            masks = [p for p in everything if "mask" in str(p).lower()]
            images = [p for p in everything if p not in set(masks)]

        matched, ambiguous = _pair_files(images, masks, category, pairs)

        logger.info(
            "%s: %d images, %d masks, %d paired%s",
            category,
            len(images),
            len(masks),
            matched,
            f", {ambiguous} unpairable" if ambiguous else "",
        )

    return pairs


def _read_image(path: Path) -> np.ndarray:
    """Read a source image as (H, W, C) float32."""
    if path.suffix.lower() == ".npy":
        array = np.load(path)
    else:
        import rasterio

        with rasterio.open(path) as handle:
            array = handle.read()  # (C, H, W)
            array = np.transpose(array, (1, 2, 0))

    if array.ndim == 2:
        array = array[:, :, None]
    return array.astype(np.float32)


def _read_mask(path: Path) -> np.ndarray:
    if path.suffix.lower() == ".npy":
        array = np.load(path)
    else:
        import rasterio

        with rasterio.open(path) as handle:
            array = handle.read(1)
    return array.astype(np.uint8)


def _to_class_mask(binary_mask: np.ndarray, category: str) -> np.ndarray:
    """Turn a per-category binary mask into the shared 3-class scheme."""
    foreground = CATEGORY_FOREGROUND[category]
    out = np.full(binary_mask.shape, SEA, dtype=np.uint8)
    if foreground != SEA:
        out[binary_mask > 0] = foreground
    return out


def _nodata_mask(raw_image: np.ndarray) -> np.ndarray:
    """Where every channel is exactly the padding sentinel, raw 0.0 dB.

    A SAR scene is captured on a rotated swath and delivered as an
    axis-aligned rectangle, so the corners are padding rather than a real
    observation. Real backscatter essentially never lands on an exact 0.0 dB
    bit pattern simultaneously across both VV and VH, so this is a clean
    signature for it -- distinct from `_assert_decibel_scale`, which rejects
    imagery in the wrong *format* rather than flagging fill *regions* within
    otherwise-correctly-formatted data.
    """
    return np.all(raw_image == 0.0, axis=-1)


def _apply_nodata(mask: np.ndarray, raw_image: np.ndarray) -> np.ndarray:
    """Mark padding pixels IGNORE_INDEX so nothing trains or scores on them.

    Applied to the class mask, not the image: the image is still fed through
    the model as-is (the network needs *something* at every pixel), but the
    label there stops asserting "this is open sea" -- a claim that isn't true
    and that taught earlier runs the padding rectangle's hard edges were a
    normal thing to see in real sea.
    """
    mask = mask.copy()
    mask[_nodata_mask(raw_image)] = IGNORE_INDEX
    return mask


class NotDecibelData(ValueError):
    """Raised when an image is not calibrated Sigma0 in dB."""


def _assert_decibel_scale(image: np.ndarray, source: str) -> None:
    """Reject imagery that is not on a dB scale.

    Without this the failure is silent and total: an 8-bit [0, 255] rendering
    run through the dB normalisation maps every pixel above 0 dB, clips to 1.0,
    and yields a uniform tile. Training would proceed happily on blank inputs.
    """
    if image.dtype == np.uint8:
        raise NotDecibelData(
            f"{source}: uint8 imagery is a visualisation rendering, not "
            f"calibrated Sigma0 dB. Normalising it as dB would flatten every "
            f"pixel to 1.0."
        )
    finite = image[np.isfinite(image)]
    if finite.size and finite.min() >= 0.0:
        raise NotDecibelData(
            f"{source}: no negative values (min {float(finite.min()):.2f}), so "
            f"this is not Sigma0 in dB — real sea backscatter is negative."
        )


def _normalise_channels(image: np.ndarray) -> np.ndarray:
    """Scale dB-valued backscatter into [0, 1] against a fixed physical range."""
    return np.clip((image - DB_MIN) / (DB_MAX - DB_MIN), 0.0, 1.0)


def _tile_one(job: tuple) -> tuple[str, list[dict], str | None]:
    """Tile a single source image. Runs in a worker process.

    Module level and taking a plain tuple so it stays picklable for the process
    pool — a closure over the enclosing scope would not be.
    """
    image_path, mask_path, category, split, tiles_dir, tile_size = job
    image_path, mask_path, tiles_dir = Path(image_path), Path(mask_path), Path(tiles_dir)

    stem = f"{category}_{image_path.stem}"
    out_dir = tiles_dir / split / category
    entries: list[dict] = []

    # Resume: reuse tiles already on disk rather than redoing the read.
    existing = sorted(out_dir.glob(f"{stem}_r*_img.npy")) if out_dir.exists() else []
    if existing:
        for tile_image in existing:
            tile_mask = tile_image.with_name(
                tile_image.name.replace("_img.npy", "_msk.npy")
            )
            if tile_mask.exists():
                entries.append(
                    {
                        "image": str(tile_image.relative_to(tiles_dir)),
                        "mask": str(tile_mask.relative_to(tiles_dir)),
                        "category": category,
                    }
                )
        if entries:
            return split, entries, None

    try:
        raw = _read_image(image_path)
        _assert_decibel_scale(raw, image_path.name)
        image = _normalise_channels(raw)
        mask = _to_class_mask(_read_mask(mask_path), category)
        mask = _apply_nodata(mask, raw)
    except NotDecibelData as exc:
        return split, [], f"wrong radiometry: {exc}"
    except Exception as exc:
        return split, [], f"unreadable: {exc}"

    if image.shape[:2] != mask.shape[:2]:
        return split, [], f"shape mismatch {image.shape[:2]} vs {mask.shape[:2]}"

    height, width = mask.shape
    out_dir.mkdir(parents=True, exist_ok=True)

    for row in range(0, height - tile_size + 1, tile_size):
        for col in range(0, width - tile_size + 1, tile_size):
            base = f"{stem}_r{row}_c{col}"
            tile_image = out_dir / f"{base}_img.npy"
            tile_mask = out_dir / f"{base}_msk.npy"

            # float16 halves the on-disk set from ~97 GB to ~54 GB. Values are
            # already normalised into [0, 1], where float16 resolves to about
            # 5e-4 — roughly 0.02 dB on the original scale, far finer than the
            # instrument's own radiometric accuracy — and training autocasts to
            # fp16 regardless.
            np.save(tile_image, image[row : row + tile_size, col : col + tile_size].astype(np.float16))
            np.save(tile_mask, mask[row : row + tile_size, col : col + tile_size].astype(np.uint8))

            entries.append(
                {
                    "image": str(tile_image.relative_to(tiles_dir)),
                    "mask": str(tile_mask.relative_to(tiles_dir)),
                    "category": category,
                }
            )

    return split, entries, None


def cut_tiles(
    pairs: list[SourcePair],
    tiles_dir: Path,
    tile_size: int,
    split_assignment: dict[Path, str],
    workers: int | None = None,
) -> dict[str, list[dict]]:
    """Cut every source pair into non-overlapping tiles, saved as .npy.

    Parallel across processes: each source image is independent, and the work is
    dominated by reading a 32 MB raster and writing 64 small files, so this is
    almost perfectly parallelisable. Single-threaded measured ~7 tiles/sec — a
    seven-hour job for this dataset.

    Resumable: a source image whose tiles already exist is reused, so an
    interrupted run continues rather than starting over.
    """
    from concurrent.futures import ProcessPoolExecutor, as_completed

    if workers is None:
        workers = max(1, min(12, (os.cpu_count() or 4) - 2))

    manifest: dict[str, list[dict]] = {"train": [], "val": []}
    jobs = [
        (
            str(pair.image),
            str(pair.mask),
            pair.category,
            split_assignment[pair.image],
            str(tiles_dir),
            tile_size,
        )
        for pair in pairs
    ]

    logger.info("Tiling %d source images across %d workers", len(jobs), workers)
    done = 0
    failures = 0

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_tile_one, job): job for job in jobs}
        for future in as_completed(futures):
            split, entries, error = future.result()
            if error:
                failures += 1
                logger.warning("%s: %s", Path(futures[future][0]).name, error)
            manifest[split].extend(entries)

            done += 1
            if done % 100 == 0:
                total_tiles = sum(len(v) for v in manifest.values())
                logger.info(
                    "%d/%d source images, %d tiles", done, len(jobs), total_tiles
                )

    if failures:
        logger.warning("%d source image(s) could not be tiled", failures)
    return manifest


def assign_splits(pairs: list[SourcePair]) -> dict[Path, str]:
    """Split at the source-image level, stratified by category.

    Never at the tile level: tiles cut from one scene are near-duplicates of
    their neighbours, so splitting after tiling puts near-identical images on
    both sides and reports a validation score that is partly memorisation.
    """
    rng = np.random.default_rng(SPLIT_SEED)
    assignment: dict[Path, str] = {}

    by_category: dict[str, list[SourcePair]] = {}
    for pair in pairs:
        by_category.setdefault(pair.category, []).append(pair)

    for category, items in by_category.items():
        order = rng.permutation(len(items))
        n_val = max(1, int(len(items) * VAL_FRACTION))
        val_indices = set(order[:n_val].tolist())
        for index, pair in enumerate(items):
            assignment[pair.image] = "val" if index in val_indices else "train"
        logger.info("%s: %d train, %d val (source images)", category, len(items) - n_val, n_val)

    return assignment


def prepare(
    archive_dir: Path,
    output_dir: Path,
    tile_size: int = 256,
    skip_extract: bool = False,
) -> dict:
    """Extract archives and cut training tiles. Idempotent."""
    raw_dir = output_dir / "raw"
    tiles_dir = output_dir / "tiles"
    raw_dir.mkdir(parents=True, exist_ok=True)
    tiles_dir.mkdir(parents=True, exist_ok=True)

    extract_stats = {"extracted": 0, "skipped": 0, "missing": 0}
    if not skip_extract:
        extract_stats = extract_archives(archive_dir, raw_dir)

    # Part III is the held-out test set — evaluated as whole scenes, never tiled
    # into training.
    pairs = [p for p in discover_pairs(raw_dir) if p.category in TRAINING_CATEGORIES]
    if not pairs:
        raise RuntimeError(
            f"No image/mask pairs found under {raw_dir}. Check that extraction "
            f"succeeded and that filenames carry a shared numeric id."
        )

    split_assignment = assign_splits(pairs)
    manifest = cut_tiles(pairs, tiles_dir, tile_size, split_assignment)
    (tiles_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    return {
        "archives": extract_stats,
        "source_pairs": len(pairs),
        "tiles": {split: len(items) for split, items in manifest.items()},
    }
