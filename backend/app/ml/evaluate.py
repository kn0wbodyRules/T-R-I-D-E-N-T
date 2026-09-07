"""Per-class IoU on the held-out Zenodo Part III test set."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import torch

from app.ml.classes import DB_MAX, DB_MIN
from app.ml.data_prep import (
    SourcePair,
    _apply_nodata,
    _find_files,
    _numeric_key,
    _read_image,
    _read_mask,
    _to_class_mask,
)
from app.ml.dataset import CLASS_NAMES, IGNORE_INDEX, NUM_CLASSES, NUM_POLARISATIONS, OIL
from app.ml.radiometric import build_model_input
from app.ml.train import confusion_update, iou_from_confusion, selection_metric
from app.ml import postprocess


def _uses_contrast_channels(config: dict) -> bool:
    return config.get("num_channels", NUM_POLARISATIONS) > NUM_POLARISATIONS

logger = logging.getLogger(__name__)

# Part III lays itself out as Images/<Category>/ and Mask/<Category>/, and the
# same filenames (00000.tif ...) repeat inside every category. So the class a
# foreground pixel belongs to is carried by the directory, never the filename,
# and pairing has to stay within one category or 00000.tif from Oil gets scored
# against the mask from Lookalike.
PART3_CATEGORY_DIRS = {
    "oil": "part1_oil",
    "lookalike": "part2_lookalike",
    "no oil": "part2_nooil",
    "no_oil": "part2_nooil",
    "nooil": "part2_nooil",
}


def load_part3_pairs(test_dir: Path) -> list[SourcePair]:
    """Pair Part III images to masks, scoped per category directory."""
    images_root = next(
        (d for d in test_dir.iterdir() if d.is_dir() and d.name.lower() == "images"),
        None,
    )
    masks_root = next(
        (
            d
            for d in test_dir.iterdir()
            if d.is_dir() and d.name.lower() in {"mask", "masks"}
        ),
        None,
    )
    if images_root is None or masks_root is None:
        raise RuntimeError(
            f"{test_dir} does not look like the Part III layout "
            f"(expected Images/ and Mask/ subdirectories)"
        )

    pairs: list[SourcePair] = []
    for image_dir in sorted(d for d in images_root.iterdir() if d.is_dir()):
        category = PART3_CATEGORY_DIRS.get(image_dir.name.lower())
        if category is None:
            logger.warning("Unrecognised Part III category dir: %s", image_dir.name)
            continue

        mask_dir = masks_root / image_dir.name
        if not mask_dir.exists():
            logger.warning("No mask directory for %s", image_dir.name)
            continue

        # Exact-stem matching fails here: Part III's masks carry a
        # "_segmentation" suffix the images don't have (00000.tif pairs with
        # 00000_segmentation.tif), unlike Part I/II where stems already match.
        # _numeric_key strips to the trailing sample number either way, which is
        # the same mismatch data_prep.py already handles for Part I/II.
        masks = {
            key: mask_path
            for mask_path in _find_files(mask_dir)
            if (key := _numeric_key(mask_path)) is not None
        }
        matched = 0
        for image in _find_files(image_dir):
            key = _numeric_key(image)
            mask = masks.get(key) if key is not None else None
            if mask is None:
                continue
            pairs.append(SourcePair(image=image, mask=mask, category=category))
            matched += 1
        logger.info("Part III %s: %d pairs (as %s)", image_dir.name, matched, category)

    return pairs


@torch.no_grad()
def _predict_full_image(
    model, image: np.ndarray, device, tile_size: int, overlap: int = 32
) -> np.ndarray:
    """Tile a test image with overlap+trim, predict, and reassemble.

    Must match app.ml.inference.infer_scene's tiling exactly, not just
    approximately. A first version tiled with no overlap at all, which
    measured out to produce false positives aligned to the tile grid -- 33% of
    false-positive blob edges landed within 2px of a 256px grid line, against
    ~1.6% expected by chance. That inflated every false-alarm number this
    project reported: it was measuring an artifact of unblended tile seams,
    not the model's actual behaviour, and production was never run that way.

    Each tile is predicted independently, then only its trimmed interior is
    pasted into the output -- edge pixels are covered by a neighbouring tile's
    better-informed centre instead, the same reasoning inference.py uses.
    """
    stride = tile_size - overlap
    trim = overlap // 2
    height, width = image.shape[:2]
    prediction = np.zeros((height, width), dtype=np.uint8)

    rows = range(0, max(height - overlap, 1), stride)
    cols = range(0, max(width - overlap, 1), stride)

    for row in rows:
        for col in cols:
            tile_h = min(tile_size, height - row)
            tile_w = min(tile_size, width - col)
            tile = image[row : row + tile_h, col : col + tile_w]
            if tile_h < tile_size or tile_w < tile_size:
                padded = np.zeros((tile_size, tile_size, tile.shape[2]), np.float32)
                padded[:tile_h, :tile_w] = tile
                tile = padded

            tensor = torch.from_numpy(
                np.ascontiguousarray(tile.transpose(2, 0, 1))
            ).unsqueeze(0).to(device)
            with torch.autocast(device_type=device.type, dtype=torch.float16):
                logits = model(tensor)
            predicted = logits.argmax(dim=1)[0].to(torch.uint8).cpu().numpy()

            top = trim if row > 0 else 0
            left = trim if col > 0 else 0
            bottom = tile_h - trim if row + tile_size < height else tile_h
            right = tile_w - trim if col + tile_size < width else tile_w

            prediction[row + top : row + bottom, col + left : col + right] = (
                predicted[top:bottom, left:right]
            )

    return prediction


def run(checkpoint_path: Path, test_dir: Path, limit: int | None = None) -> dict:
    from app.ml.inference import load_checkpoint

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, version, config = load_checkpoint(checkpoint_path, device)
    tile_size = config.get("tile_size", 256)
    use_contrast_channels = _uses_contrast_channels(config)

    pairs = load_part3_pairs(test_dir)
    if not pairs:
        raise RuntimeError(f"No test image/mask pairs found under {test_dir}")
    if limit:
        # Stride rather than truncate: the pairs come out grouped by category,
        # so taking the first N would evaluate only look-alikes.
        step = max(1, len(pairs) // limit)
        pairs = pairs[::step][:limit]

    logger.info("Evaluating %d test images with %s", len(pairs), version)
    matrix = np.zeros((NUM_CLASSES, NUM_CLASSES), dtype=np.int64)
    # Pixel-pooled IoU (the `matrix` above) weights every pixel equally, so a
    # handful of images with unusually large oil coverage can dominate the
    # aggregate and hide how the model does on a typical image. Tracked
    # per-image too, on oil-ground-truth images only, and averaged unweighted,
    # so that pattern is visible rather than silently baked into one number --
    # this is exactly what happened on this dataset, where 2 of 150 oil images
    # are 48% and 55% oil coverage against a ~1% training average, and dominate
    # the pooled figure.
    per_image_iou: list[float] = []
    per_image_detail: list[dict] = []

    # Mirrors every metric above, but on postprocess.clean_and_filter's output
    # instead of the raw per-pixel prediction -- the same speckle/min-blob
    # cleanup production infer-scene always applies before a prediction ever
    # becomes a reported detection. Raw shows how good the segmentation network
    # itself is; cleaned shows what a real deployment would actually surface.
    # Reported side by side always, not behind a flag, so nobody has to
    # remember which mode a number came from later.
    matrix_cleaned = np.zeros((NUM_CLASSES, NUM_CLASSES), dtype=np.int64)
    per_image_iou_cleaned: list[float] = []

    for index, pair in enumerate(pairs):
        try:
            raw = _read_image(pair.image)
            image = build_model_input(raw, use_contrast_channels=use_contrast_channels)
            # Category came from the directory at load time, so use it directly.
            truth = _to_class_mask(_read_mask(pair.mask), pair.category)
            # Padding regions carry no real observation; scoring them as sea
            # would count the model's actual behaviour there as either a true
            # negative it doesn't deserve or a false positive it shouldn't be
            # charged for. confusion_update already drops any target outside
            # [0, NUM_CLASSES), so tagging them IGNORE_INDEX here is enough to
            # exclude them from the pixel-pooled confusion matrix below.
            truth = _apply_nodata(truth, raw)
        except Exception as exc:
            logger.warning("Skipping %s: %s", pair.image.name, exc)
            continue

        prediction = _predict_full_image(model, image, device, tile_size)
        confusion_update(matrix, prediction.ravel(), truth.ravel())

        prediction_cleaned = postprocess.clean_and_filter(prediction)
        confusion_update(matrix_cleaned, prediction_cleaned.ravel(), truth.ravel())

        # confusion_update already excludes no-data from the pixel-pooled
        # matrix via the target filter, but this union/intersection is computed
        # by hand -- truth_oil is naturally False on no-data (truth is
        # IGNORE_INDEX there, never OIL), but a false "oil" prediction landing
        # inside a no-data region would still inflate the union unless pred_oil
        # is masked the same way.
        valid = truth != IGNORE_INDEX
        truth_oil = truth == OIL
        pred_oil = (prediction == OIL) & valid
        # Scoped to images that actually have oil ground truth. On a
        # zero-truth image (look-alike, no-oil) IoU is 0.0 for *any* false
        # positive at all -- one stray pixel scores identically to a completely
        # wrong prediction, which measures nothing useful about detection
        # quality and would silently drag this statistic down for a reason
        # unrelated to how well real oil is being found. False-alarm rate on
        # those categories is a real question, just a different one, and
        # validate_visual answers it properly (any detection at all = a
        # false alarm) rather than folding it into a partial-credit metric.
        if pair.category == "part1_oil" and truth_oil.any():
            union = (truth_oil | pred_oil).sum()
            image_iou = float((truth_oil & pred_oil).sum() / union) if union else float("nan")
            per_image_iou.append(image_iou)
            per_image_detail.append(
                {
                    "image": str(pair.image),
                    "category": pair.category,
                    "truth_oil_frac": float(truth_oil.mean()),
                    "pred_oil_frac": float(pred_oil.mean()),
                    "iou": image_iou,
                }
            )

            pred_oil_cleaned = (prediction_cleaned == OIL) & valid
            union_cleaned = (truth_oil | pred_oil_cleaned).sum()
            per_image_iou_cleaned.append(
                float((truth_oil & pred_oil_cleaned).sum() / union_cleaned)
                if union_cleaned else float("nan")
            )

        if (index + 1) % 25 == 0:
            logger.info("  %d/%d", index + 1, len(pairs))

    class_iou = iou_from_confusion(matrix)
    class_iou_cleaned = iou_from_confusion(matrix_cleaned)
    per_image_detail.sort(key=lambda d: d["iou"])
    return {
        "model_version": version,
        "images": len(pairs),
        "class_iou": class_iou,
        "selection_metric": selection_metric(class_iou),
        "confusion": matrix.tolist(),
        "per_image_mean_oil_iou": float(np.mean(per_image_iou)) if per_image_iou else float("nan"),
        "per_image_median_oil_iou": float(np.median(per_image_iou)) if per_image_iou else float("nan"),
        "worst_images": per_image_detail[:5],
        "best_images": per_image_detail[-5:],
        "class_iou_cleaned": class_iou_cleaned,
        "confusion_cleaned": matrix_cleaned.tolist(),
        "per_image_mean_oil_iou_cleaned": (
            float(np.mean(per_image_iou_cleaned)) if per_image_iou_cleaned else float("nan")
        ),
        "per_image_median_oil_iou_cleaned": (
            float(np.median(per_image_iou_cleaned)) if per_image_iou_cleaned else float("nan")
        ),
    }


def _oil_pixel_recall(matrix: np.ndarray) -> float:
    """TP/(TP+FN) for the OIL row of a [target, predicted] confusion matrix."""
    truth_total = matrix[OIL].sum()
    return float(matrix[OIL, OIL] / truth_total) if truth_total > 0 else float("nan")


def run_domain_shift_sweep(
    checkpoint_path: Path,
    test_dir: Path,
    offsets_db: tuple[float, ...] = (0.0, 3.0, 6.0, 10.0, 15.0, 20.0),
    limit: int | None = None,
) -> dict:
    """Measure how badly a uniform additive dB shift degrades this checkpoint.

    Applies the offset to the raw calibrated-dB image before normalisation --
    the same operation the controlled experiment used to causally demonstrate
    that this model keys on absolute backscatter level rather than local
    contrast (real Sentinel-1 water reads ~18dB brighter than this training
    distribution's typical sea). Sweeping all three Part III categories, not
    just oil, also checks whether false-alarm rates drift under a pure
    brightness shift -- a real scene doesn't just fail to show oil, it might
    also start crying wolf differently, and that hasn't been ruled out yet.
    """
    from app.ml.inference import load_checkpoint

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, version, config = load_checkpoint(checkpoint_path, device)
    tile_size = config.get("tile_size", 256)
    use_contrast_channels = _uses_contrast_channels(config)

    pairs = load_part3_pairs(test_dir)
    if not pairs:
        raise RuntimeError(f"No test image/mask pairs found under {test_dir}")
    if limit:
        step = max(1, len(pairs) // limit)
        pairs = pairs[::step][:limit]

    per_offset: dict[str, dict] = {}
    for offset in offsets_db:
        matrix = np.zeros((NUM_CLASSES, NUM_CLASSES), dtype=np.int64)
        per_image_oil_iou: list[float] = []
        fire_counts = {"part1_oil": [0, 0], "part2_lookalike": [0, 0], "part2_nooil": [0, 0]}

        for pair in pairs:
            try:
                raw = _read_image(pair.image)
                truth = _apply_nodata(_to_class_mask(_read_mask(pair.mask), pair.category), raw)
            except Exception as exc:
                logger.warning("Skipping %s: %s", pair.image.name, exc)
                continue

            shifted = np.clip(raw + offset, DB_MIN, DB_MAX)
            image = build_model_input(shifted, use_contrast_channels=use_contrast_channels)
            prediction = _predict_full_image(model, image, device, tile_size)
            confusion_update(matrix, prediction.ravel(), truth.ravel())

            valid = truth != IGNORE_INDEX
            pred_oil = (prediction == OIL) & valid
            bucket = fire_counts.setdefault(pair.category, [0, 0])
            bucket[0] += int(pred_oil.any())
            bucket[1] += 1

            if pair.category == "part1_oil":
                truth_oil = truth == OIL
                if truth_oil.any():
                    union = (truth_oil | pred_oil).sum()
                    per_image_oil_iou.append(
                        float((truth_oil & pred_oil).sum() / union) if union else float("nan")
                    )

        def fire_rate(category: str) -> float:
            fired, total = fire_counts.get(category, [0, 0])
            return float(fired / total) if total else float("nan")

        per_offset[str(offset)] = {
            "class_iou": iou_from_confusion(matrix),
            "oil_pixel_recall": _oil_pixel_recall(matrix),
            "per_image_mean_oil_iou": float(np.mean(per_image_oil_iou)) if per_image_oil_iou else float("nan"),
            "per_image_median_oil_iou": float(np.median(per_image_oil_iou)) if per_image_oil_iou else float("nan"),
            "oil_detection_rate": fire_rate("part1_oil"),
            "lookalike_false_alarm_rate": fire_rate("part2_lookalike"),
            "nooil_false_alarm_rate": fire_rate("part2_nooil"),
        }
        logger.info(
            "offset=%+.0fdB: oil_pixel_recall=%.4f median_oil_iou=%.4f lookalike_fp=%.4f nooil_fp=%.4f",
            offset, per_offset[str(offset)]["oil_pixel_recall"],
            per_offset[str(offset)]["per_image_median_oil_iou"],
            per_offset[str(offset)]["lookalike_false_alarm_rate"],
            per_offset[str(offset)]["nooil_false_alarm_rate"],
        )

    return {
        "checkpoint": str(checkpoint_path),
        "model_version": version,
        "images": len(pairs),
        "offsets_db": list(offsets_db),
        "per_offset": per_offset,
    }


def run_real_scene_smoke_check(
    checkpoint_path: Path,
    scene_path: Path,
    anomaly_pixel_rc: tuple[int, int] = (14145, 17178),
    patch_radius: int = 256,
    device: torch.device | None = None,
) -> dict:
    """Qualitative check: does OIL probability rise near the one real anomaly
    location this whole investigation started from (Corsica, Oct 2018)?

    No ground truth exists for this scene -- there is no mask to score against,
    only a visually-identified candidate feature -- so this is informational
    only and must never feed the champion gate. It is the most direct check of
    whether a fix moves the needle on the actual case that motivated it.
    """
    from app.ml.inference import load_checkpoint
    from app.ml.sar_product import SafeProduct, build_sigma_nought_interpolator, calibrate_to_db
    import rasterio
    from rasterio.windows import Window

    device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, version, config = load_checkpoint(checkpoint_path, device)
    use_contrast_channels = _uses_contrast_channels(config)

    row, col = anomaly_pixel_rc
    size = patch_radius * 2
    top, left = row - patch_radius, col - patch_radius

    with SafeProduct(scene_path) as product:
        pols = product.available_polarisations()
        ordered = [p for p in ("vv", "vh") if p in pols]
        channels = []
        for pol in ordered:
            sigma = build_sigma_nought_interpolator(product.read_calibration_grid(pol))
            uri = f"zip://{product.path}!/{product.measurement_path(pol)}"
            with rasterio.open(uri) as handle:
                dn = handle.read(1, window=Window(left, top, size, size))
                channels.append(calibrate_to_db(dn, sigma, top, left))
    stacked = np.stack(channels, axis=-1).astype(np.float32)

    image = build_model_input(stacked, use_contrast_channels=use_contrast_channels)
    tensor = torch.from_numpy(np.ascontiguousarray(image.transpose(2, 0, 1))).unsqueeze(0).to(device)
    with torch.no_grad(), torch.autocast(device_type=device.type, dtype=torch.float16):
        logits = model(tensor)
        probs = torch.softmax(logits.float(), dim=1)
    oil_prob = probs[0, OIL].cpu().numpy()
    predicted = logits.argmax(dim=1)[0].cpu().numpy()

    return {
        "checkpoint": str(checkpoint_path),
        "model_version": version,
        "scene": str(scene_path),
        "anomaly_pixel_rc": list(anomaly_pixel_rc),
        "oil_prob_max": float(oil_prob.max()),
        "oil_prob_mean": float(oil_prob.mean()),
        "pixels_above_0.5": int((oil_prob > 0.5).sum()),
        "pixels_predicted_oil": int((predicted == OIL).sum()),
        "patch_pixels": int(predicted.size),
    }
