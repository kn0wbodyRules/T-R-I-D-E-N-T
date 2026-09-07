"""Qualitative check of a trained model against held-out real scenes.

Per-class IoU says how well the model scores; it does not say whether the
failures are the ones that matter. This renders predictions beside ground truth
so they can be looked at, and reports the two error modes this task actually
cares about, separately:

  - a miss on an oil scene, and
  - a false alarm on a look-alike scene, which is the harder and more damaging
    error here. Firing on an algal bloom or a low-wind patch is what makes a
    detector untrustworthy, and it is invisible in an oil-only IoU.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import torch

from app.ml.classes import IGNORE_INDEX, OIL
from app.ml.data_prep import (
    _apply_nodata,
    _read_image,
    _read_mask,
    _to_class_mask,
)
from app.ml.evaluate import _predict_full_image, _uses_contrast_channels, load_part3_pairs
from app.ml.radiometric import build_model_input
from app.ml import postprocess

logger = logging.getLogger(__name__)


def _to_png_rgb(
    backscatter: np.ndarray, truth: np.ndarray, predicted: np.ndarray
) -> np.ndarray:
    """Grey SAR background, ground truth in green, prediction in red.

    Overlaid rather than shown side by side: agreement then reads as yellow, and
    the disagreements — red-only false alarms, green-only misses — are what the
    eye should land on first.
    """
    base = np.clip(backscatter, 0.0, 1.0)
    rgb = np.stack([base, base, base], axis=-1)
    rgb[..., 1] = np.where(truth == OIL, 1.0, rgb[..., 1])
    rgb[..., 0] = np.where(predicted == OIL, 1.0, rgb[..., 0])
    return (rgb * 255).astype(np.uint8)


def run(
    checkpoint_path: Path,
    test_dir: Path,
    out_dir: Path,
    per_category: int = 6,
) -> dict:
    """Render predictions and report per-category error rates."""
    import cv2

    from app.ml.inference import load_checkpoint

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, version, config = load_checkpoint(checkpoint_path, device)
    tile_size = config.get("tile_size", 256)
    use_contrast_channels = _uses_contrast_channels(config)

    out_dir.mkdir(parents=True, exist_ok=True)
    pairs = load_part3_pairs(test_dir)

    by_category: dict[str, list] = {}
    for pair in pairs:
        by_category.setdefault(pair.category, []).append(pair)

    report: dict[str, dict] = {}

    for category, items in sorted(by_category.items()):
        detected = 0
        total_predicted_px = 0
        total_truth_px = 0
        intersection_px = 0

        # Mirrors the raw counters above, on postprocess.clean_and_filter's
        # output -- the speckle/min-blob cleanup production infer-scene always
        # applies before a prediction becomes a reported detection. Reported
        # alongside the raw numbers always, not behind a flag.
        detected_cleaned = 0
        total_predicted_px_cleaned = 0
        intersection_px_cleaned = 0

        for index, pair in enumerate(items):
            try:
                raw = _read_image(pair.image)
                image = build_model_input(raw, use_contrast_channels=use_contrast_channels)
                truth = _to_class_mask(_read_mask(pair.mask), pair.category)
                truth = _apply_nodata(truth, raw)
            except Exception as exc:
                logger.warning("Skipping %s: %s", pair.image.name, exc)
                continue

            predicted = _predict_full_image(model, image, device, tile_size)

            # A false "oil" call landing purely inside a no-data padding
            # region isn't a real false alarm and must not be able to trip
            # detection_rate/pixel_iou on its own -- same reasoning as
            # evaluate.py's per-image IoU fix.
            valid = truth != IGNORE_INDEX
            predicted_oil = (predicted == OIL) & valid
            truth_oil = truth == OIL
            total_predicted_px += int(predicted_oil.sum())
            total_truth_px += int(truth_oil.sum())
            intersection_px += int((predicted_oil & truth_oil).sum())
            if predicted_oil.any():
                detected += 1

            predicted_cleaned = postprocess.clean_and_filter(predicted)
            predicted_oil_cleaned = (predicted_cleaned == OIL) & valid
            total_predicted_px_cleaned += int(predicted_oil_cleaned.sum())
            intersection_px_cleaned += int((predicted_oil_cleaned & truth_oil).sum())
            if predicted_oil_cleaned.any():
                detected_cleaned += 1

            if index < per_category:
                cv2.imwrite(
                    str(out_dir / f"{category}_{pair.image.stem}.png"),
                    cv2.cvtColor(
                        _to_png_rgb(image[..., 0], truth, predicted), cv2.COLOR_RGB2BGR
                    ),
                )

        union_px = total_predicted_px + total_truth_px - intersection_px
        union_px_cleaned = total_predicted_px_cleaned + total_truth_px - intersection_px_cleaned
        report[category] = {
            "scenes": len(items),
            "scenes_with_any_detection": detected,
            "detection_rate": detected / max(len(items), 1),
            "pixel_iou": intersection_px / union_px if union_px else float("nan"),
            "predicted_oil_px": total_predicted_px,
            "truth_oil_px": total_truth_px,
            "scenes_with_any_detection_cleaned": detected_cleaned,
            "detection_rate_cleaned": detected_cleaned / max(len(items), 1),
            "pixel_iou_cleaned": (
                intersection_px_cleaned / union_px_cleaned if union_px_cleaned else float("nan")
            ),
            "predicted_oil_px_cleaned": total_predicted_px_cleaned,
        }
        logger.info("%s: %s", category, report[category])

    # On categories whose ground truth carries no oil at all, any detection is a
    # false alarm — so the detection rate there IS the false-alarm rate.
    report["_summary"] = {
        "model_version": version,
        "oil_detection_rate": report.get("part1_oil", {}).get("detection_rate"),
        "lookalike_false_alarm_rate": report.get("part2_lookalike", {}).get(
            "detection_rate"
        ),
        "nooil_false_alarm_rate": report.get("part2_nooil", {}).get("detection_rate"),
        "oil_detection_rate_cleaned": report.get("part1_oil", {}).get(
            "detection_rate_cleaned"
        ),
        "lookalike_false_alarm_rate_cleaned": report.get("part2_lookalike", {}).get(
            "detection_rate_cleaned"
        ),
        "nooil_false_alarm_rate_cleaned": report.get("part2_nooil", {}).get(
            "detection_rate_cleaned"
        ),
        "renders": str(out_dir),
    }
    return report
