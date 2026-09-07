"""The champion gate: decide whether a new checkpoint replaces the recorded best.

No prior checkpoint in this project's history has ever been "the current model"
in any way the code enforces -- every command takes an explicit --checkpoint
with no fallback. Two of four training runs regressed on look-alike false
alarms, the metric this project cares about most, so a retrain that makes
things worse must not become the de facto answer just because it's newest.
This module is that guarantee, made mechanical: a champion is only ever
replaced by a candidate that clears fixed, named thresholds set before the
candidate existed, not by eyeballing numbers after the fact.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# Look-alike false alarms are the metric this project has repeatedly
# regressed on (two of four runs so far), so it gets a zero-tolerance floor --
# any increase at all is a hard reject, not something a good IoU number can
# outweigh.
LOOKALIKE_FP_NO_REGRESSION = 0.0
# A drop of at least this many points is what distinguishes a real win from
# noise across a 450-image test set -- smaller than this and PROMOTE requires
# an accompanying IoU gain instead (see gate()).
LOOKALIKE_FP_IMPROVEMENT = 0.02
# Segmentation quality is allowed to soften somewhat if false alarms improve,
# but not collapse -- below 90% of the champion's median oil IoU is treated
# the same as the `corrective` regression that motivated this gate.
OIL_IOU_FLOOR_RATIO = 0.90
# Clean-sea FP already regressed 3.3pp between baseline and `final`; allowing
# up to a further 3pp keeps that precedent from silently drifting further.
NOOIL_FP_MAX_REGRESSION = 0.03


def metrics_from_reports(
    eval_report: dict, visual_report: dict, domain_shift_report: dict | None = None
) -> dict:
    """Flatten the two report dicts into the metric set the gate compares on.

    domain_shift_report, if given, is tracked and recorded on the manifest but
    does not currently affect gate() -- there isn't yet a real-data-backed bar
    for what "acceptably robust" looks like, and setting one before any
    candidate has produced numbers would be tuning a threshold to results
    already seen, which is exactly what this project's fixed-thresholds
    discipline exists to avoid. It becomes a gate criterion once an
    Experiment-A/B result establishes a defensible one.
    """
    summary = visual_report["_summary"]
    metrics = {
        "lookalike_false_alarm_rate": summary["lookalike_false_alarm_rate"],
        "nooil_false_alarm_rate": summary["nooil_false_alarm_rate"],
        "oil_detection_rate": summary["oil_detection_rate"],
        "lookalike_false_alarm_rate_cleaned": summary["lookalike_false_alarm_rate_cleaned"],
        "nooil_false_alarm_rate_cleaned": summary["nooil_false_alarm_rate_cleaned"],
        "oil_detection_rate_cleaned": summary["oil_detection_rate_cleaned"],
        "per_image_mean_oil_iou": eval_report["per_image_mean_oil_iou"],
        "per_image_median_oil_iou": eval_report["per_image_median_oil_iou"],
        "per_image_median_oil_iou_cleaned": eval_report["per_image_median_oil_iou_cleaned"],
        "pixel_pooled_oil_iou": eval_report["class_iou"]["oil"],
        "pixel_pooled_oil_iou_cleaned": eval_report["class_iou_cleaned"]["oil"],
    }
    if domain_shift_report is not None:
        per_offset = domain_shift_report["per_offset"]
        metrics["domain_shift_offsets_db"] = domain_shift_report["offsets_db"]
        for offset in domain_shift_report["offsets_db"]:
            key = str(offset).rstrip("0").rstrip(".") or "0"
            metrics[f"domain_shift_oil_recall_at_{key}db"] = per_offset[str(offset)]["oil_pixel_recall"]
    return metrics


def load_champion(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text())


def gate(champion: dict | None, candidate: dict) -> tuple[str, list[str]]:
    """Return (verdict, reasons). verdict in {"PROMOTE", "MARGINAL", "REJECT"}.

    Gates on the RAW (harsh, any-single-pixel-counts) numbers, matching every
    comparison already made across this project's four prior runs -- the
    cleaned numbers are recorded on the manifest for information, but
    deliberately don't gate, so introducing them here isn't itself a second,
    un-isolated change alongside whatever the candidate retrain changed.
    """
    if champion is None:
        return "PROMOTE", ["No existing champion; bootstrapping."]

    c = champion["metrics"]
    reasons: list[str] = []
    hard_fail = False

    d_lookalike = candidate["lookalike_false_alarm_rate"] - c["lookalike_false_alarm_rate"]
    if d_lookalike > LOOKALIKE_FP_NO_REGRESSION:
        hard_fail = True
        reasons.append(
            f"REJECT: look-alike FP regressed {d_lookalike:+.1%} "
            f"({c['lookalike_false_alarm_rate']:.1%} -> {candidate['lookalike_false_alarm_rate']:.1%})"
        )

    iou_ratio = (
        candidate["per_image_median_oil_iou"] / c["per_image_median_oil_iou"]
        if c["per_image_median_oil_iou"] else float("inf")
    )
    if iou_ratio < OIL_IOU_FLOOR_RATIO:
        hard_fail = True
        reasons.append(
            f"REJECT: median oil IoU fell to {iou_ratio:.0%} of champion's "
            f"({c['per_image_median_oil_iou']:.4f} -> {candidate['per_image_median_oil_iou']:.4f})"
        )

    d_nooil = candidate["nooil_false_alarm_rate"] - c["nooil_false_alarm_rate"]
    if d_nooil > NOOIL_FP_MAX_REGRESSION:
        hard_fail = True
        reasons.append(
            f"REJECT: clean-sea FP regressed {d_nooil:+.1%}, over the "
            f"{NOOIL_FP_MAX_REGRESSION:.0%} ceiling"
        )

    if hard_fail:
        return "REJECT", reasons

    d_iou = candidate["per_image_median_oil_iou"] - c["per_image_median_oil_iou"]
    if d_lookalike <= -LOOKALIKE_FP_IMPROVEMENT and d_iou >= 0:
        return "PROMOTE", [f"Look-alike FP improved {-d_lookalike:.1%} with no IoU loss."]
    if abs(d_lookalike) < 0.005 and d_iou > 0:
        return "PROMOTE", ["Look-alike FP flat, oil IoU improved: strict Pareto improvement."]

    reasons.append(
        f"MARGINAL: look-alike FP {d_lookalike:+.1%}, oil IoU {d_iou:+.4f} -- "
        "gates pass but the win isn't clean-cut; needs a human call."
    )
    return "MARGINAL", reasons


def write_champion(
    path: Path, checkpoint_path: Path, version: str, metrics: dict, test_dir: Path,
    promoted_via: str = "check-champion",
) -> None:
    previous = load_champion(path)
    history = list(previous.get("history", [])) if previous else []
    if previous:
        history.append({k: v for k, v in previous.items() if k != "history"})
    payload = {
        "checkpoint": checkpoint_path.name,
        "model_version": version,
        "promoted_at": datetime.now(timezone.utc).isoformat(),
        "promoted_via": promoted_via,
        "test_dir": str(test_dir),
        "metrics": metrics,
        "history": history,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2))
    tmp.replace(path)  # atomic on the same filesystem
    logger.info("Champion updated: %s", checkpoint_path.name)
