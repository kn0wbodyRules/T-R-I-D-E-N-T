"""Mine hard negatives from look-alike training tiles.

Runs a checkpoint over every train-split look-alike tile and records what
fraction of each tile it wrongly calls oil. Those masks are all zero by
construction (see classes.py), so every predicted-oil pixel here is a false
positive -- which makes this a direct measurement of which look-alike tiles
actually fool that model, rather than treating all of them as equally
informative the way the uniform hard-negative share does on its own.

No-data (IGNORE_INDEX) pixels are excluded from that fraction. They carry no
training signal in the loss, so the model's behaviour there is architecturally
undefined rather than a real judgement about the scene -- and measured on the
first mining round against `final`, tiles dominated by no-data padding were
disproportionately represented among the "worst offenders" (fp_fraction vs
no-data-fraction correlation of 0.63 across the 507 tiles that fooled it).
Redistributing the hard-negative sampling budget toward that list taught the
`remined` retrain to react to swath-edge artifacts, not look-alike phenomena --
excluding them from the measurement in the first place is the fix, not a
smaller boost or a different budget.

Train split only, deliberately: mining on val or Part III would leak the
evaluation signal into training and invalidate both the per-epoch instrumentation
and the final comparison.

Callable via `run()` (used by `mine-hard-negatives` in cli.py) so re-mining
against a stronger checkpoint later -- exactly what happened between the
`final` and `remined` runs -- is a checkpoint argument, not a code edit.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from app.ml.classes import IGNORE_INDEX, OIL
from app.ml.dataset import SlickTileDataset, load_split
from app.ml.inference import load_checkpoint

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def run(checkpoint_path: Path, tiles_dir: Path, out_path: Path | None = None) -> dict:
    out_path = out_path or (tiles_dir / "tile_lookalike_fp.json")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, version, _ = load_checkpoint(checkpoint_path, device)
    logger.info("Mining with %s on %s", version, device)

    train_tiles = load_split(tiles_dir, "train")
    indices = [i for i, t in enumerate(train_tiles) if t.category == "part2_lookalike"]
    logger.info("Train tiles: %d, of which look-alike: %d", len(train_tiles), len(indices))

    # Guard the leak risk explicitly rather than trusting the manifest's shape.
    stray = [i for i in indices if "train" not in Path(train_tiles[i].image_path).parts]
    if stray:
        raise RuntimeError(f"{len(stray)} mining tiles are not under the train split")

    subset = [train_tiles[i] for i in indices]
    loader = DataLoader(
        SlickTileDataset(subset, augment=False),
        batch_size=64,
        shuffle=False,
        num_workers=8,
        pin_memory=device.type == "cuda",
    )

    fp_fraction = np.zeros(len(train_tiles), dtype=np.float64)
    cursor = 0
    with torch.no_grad():
        for images, masks in loader:
            images = images.to(device, non_blocking=True)
            masks = masks.to(device, non_blocking=True)
            with torch.autocast(device_type=device.type, dtype=torch.float16):
                logits = model(images)
            predicted_oil = logits.argmax(dim=1) == OIL
            valid = masks != IGNORE_INDEX
            # Fraction over valid pixels only -- a no-data-heavy tile with a
            # handful of real pixels shouldn't be scored on the ~undefined
            # prediction over its padding, same reasoning as evaluate.py's
            # no-data exclusion from FP/FN counting.
            valid_counts = valid.sum(dim=(1, 2)).clamp(min=1)
            frac = ((predicted_oil & valid).sum(dim=(1, 2)) / valid_counts).float().cpu().numpy()
            for value in frac:
                fp_fraction[indices[cursor]] = float(value)
                cursor += 1
            if cursor % 6400 < 64:
                logger.info("  %d/%d", cursor, len(indices))

    mined = fp_fraction[indices]
    any_fp = mined > 0
    logger.info(
        "Look-alike tiles with ANY false positive: %d/%d (%.1f%%)",
        int(any_fp.sum()), len(mined), 100 * any_fp.mean(),
    )
    for threshold in (0.01, 0.05, 0.20, 0.50):
        logger.info(
            "  over %4.0f%% of tile called oil: %5d tiles (%.2f%%)",
            threshold * 100, int((mined > threshold).sum()),
            100 * (mined > threshold).mean(),
        )
    logger.info("  mean FP fraction over look-alike tiles: %.4f", mined.mean())

    # Worst offenders, as a cheap stand-in for a phenomenon-stratified breakdown:
    # these filenames are what actually fools the model.
    order = np.argsort(-mined)[:15]
    logger.info("Worst 15 look-alike tiles by false-positive fraction:")
    for rank in order:
        logger.info("  %-52s %.3f", Path(subset[rank].image_path).name, mined[rank])

    out_path.write_text(json.dumps({"train": fp_fraction.tolist()}))
    logger.info("Wrote %s (%d entries)", out_path, len(fp_fraction))

    return {
        "checkpoint": str(checkpoint_path),
        "out_path": str(out_path),
        "lookalike_tiles": len(indices),
        "any_fp": int(any_fp.sum()),
        "mean_fp_fraction": float(mined.mean()),
    }


if __name__ == "__main__":
    run(
        Path("/data/ml/checkpoints/deeplabv3plus_resnet34_20260902.pt"),
        Path("/data/training/tiles"),
    )
