"""Class scheme, tile dataset, and augmentation for oil-slick segmentation."""

from __future__ import annotations

import functools
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path

import albumentations as A
import numpy as np
import torch
from torch.utils.data import Dataset

from app.ml.classes import (  # noqa: F401  (re-exported for convenience)
    CATEGORY_FOREGROUND,
    CLASS_NAMES,
    DB_MAX,
    DB_MIN,
    IGNORE_INDEX,
    NUM_CHANNELS,
    NUM_CLASSES,
    NUM_CONTRAST_CHANNELS,
    NUM_POLARISATIONS,
    OIL,
    SEA,
)
from app.ml.radiometric import build_model_input


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TileRef:
    image_path: Path
    mask_path: Path
    category: str


def _apply_db_shift(
    image: np.ndarray,
    db_range: tuple[float, float] = (-20.0, 20.0),
    num_level_channels: int | None = None,
) -> np.ndarray:
    """Shift the tile's absolute brightness by a random additive dB offset.

    image is already normalised to [0, 1] (see data_prep._normalise_channels),
    so an offset in dB is converted to that same fraction-of-range before
    adding. This is the identical operation a controlled experiment used to
    causally show the model depends on absolute backscatter level: a +3dB
    shift on an ordinary training tile (not a large spill), with oil-vs-sea
    contrast held exactly fixed by construction, collapsed recall from 87% to
    0%. Real Sentinel-1 water was measured at ~18dB brighter (VV) than this
    training distribution's typical sea, so +-20dB gives comfortable margin
    over the observed gap.

    num_level_channels restricts the shift to the first N channels -- when a
    tile also carries local-contrast channels (radiometric.py), those are
    already shift-invariant by construction and must NOT be perturbed the
    same way; None (the default) shifts every channel, correct for plain
    VV/VH tiles.
    """
    offset_db = float(np.random.uniform(*db_range))
    delta_norm = offset_db / (DB_MAX - DB_MIN)
    n = image.shape[-1] if num_level_channels is None else num_level_channels
    out = image.copy()
    out[..., :n] = np.clip(image[..., :n] + delta_norm, 0.0, 1.0)
    return out.astype(image.dtype)


def _db_shift_transform(image: np.ndarray, num_level_channels: int | None = None, **kwargs) -> np.ndarray:
    """Named wrapper for A.Lambda -- a lambda here would fail to pickle across
    DataLoader worker processes (num_workers > 0 is the default in train.py)."""
    return _apply_db_shift(image, num_level_channels=num_level_channels)


def build_augmentations(
    radiometric_shift: bool = True, num_level_channels: int | None = None
) -> A.Compose:
    """Augmentations that are physically defensible on SAR backscatter.

    Flips and 90-degree rotations are free: a SAR scene has no canonical "up",
    so an oil slick is equally plausible in any orientation.

    The small brightness/contrast jitter below was originally kept tight on
    the theory that absolute dB level carries the physical signal, so shifting
    levels hard would corrupt the label's meaning. A controlled experiment
    (2026-09) falsified that for out-of-distribution scenes: a real, freshly
    downloaded Sentinel-1 scene produced zero detections anywhere, and a
    synthetic +3dB whole-tile shift (contrast held exactly fixed) reproduced
    the same collapse causally. The wide `_apply_db_shift` below is the direct
    response -- it deliberately overrides that original reasoning, on purpose,
    with evidence. Colour/hue transforms are still absent for the same reason
    as before: they assume 3-channel RGB and are meaningless on VV/VH.

    radiometric_shift=False disables that one transform, keeping only the
    small jitter below -- used to isolate a different robustness mechanism
    (e.g. local-contrast channels) from this one's effect, per this project's
    single-variable-per-experiment convention.
    """
    transforms = [
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.5),
        A.RandomRotate90(p=0.5),
        # std_range is a fraction of the value range, and the data is
        # normalised to [0, 1]. Kept small: this stands in for speckle
        # variation, and heavy noise would bury the backscatter suppression
        # that distinguishes oil in the first place.
        A.GaussNoise(std_range=(0.01, 0.04), p=0.2),
        A.RandomBrightnessContrast(
            brightness_limit=0.05, contrast_limit=0.05, p=0.2
        ),
    ]
    if radiometric_shift:
        # The primary radiometric-robustness mechanism (see docstring above)
        # -- high probability since this is now load-bearing, not a minor
        # jitter. Image-only by construction (A.Lambda's `image=` never
        # touches the mask), so it can never desynchronise labels.
        transforms.append(
            A.Lambda(
                image=functools.partial(_db_shift_transform, num_level_channels=num_level_channels),
                p=0.7,
            )
        )
    return A.Compose(transforms)


# Docker Desktop's Windows bind mount intermittently fails a read under the
# sustained random-access load of many workers over ~164k small files, raising
# OSError(EFAULT, "Bad address") on a file that is perfectly intact — verified by
# reading the same file straight from the host afterwards. One such blip killed a
# nine-epoch run, so a transient read is retried rather than being allowed to end
# hours of training.
_LOAD_ATTEMPTS = 5


def _load_with_retry(path: Path) -> np.ndarray:
    for attempt in range(_LOAD_ATTEMPTS):
        try:
            return np.load(path)
        except (OSError, ValueError) as exc:
            if attempt == _LOAD_ATTEMPTS - 1:
                raise
            # Brief, growing pause: the failure is a momentary mount hiccup, so
            # the next attempt usually succeeds outright.
            time.sleep(0.1 * (attempt + 1))
            logger.warning(
                "Retrying read of %s after %s (attempt %d)",
                path.name, exc.__class__.__name__, attempt + 1,
            )
    raise RuntimeError("unreachable")


class SlickTileDataset(Dataset):
    """Pre-cut .npy tiles produced by data_prep.

    Tiles are stored decoded so the loader does no image decompression per item;
    at this tile count, decode cost dominates GPU time otherwise.
    """

    def __init__(
        self,
        tiles: list[TileRef],
        augment: bool = False,
        radiometric_shift: bool = True,
        num_level_channels: int | None = None,
        use_contrast_channels: bool = False,
    ) -> None:
        self.tiles = tiles
        self.transform = (
            build_augmentations(radiometric_shift=radiometric_shift, num_level_channels=num_level_channels)
            if augment
            else None
        )
        self.use_contrast_channels = use_contrast_channels

    def __len__(self) -> int:
        return len(self.tiles)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        ref = self.tiles[index]
        # Tiles are stored float16; the model runs in fp16 autocast but the
        # augmentation pipeline expects float32, so widen here.
        image = _load_with_retry(ref.image_path).astype(np.float32)  # (H, W, C)
        mask = _load_with_retry(ref.mask_path)  # (H, W)

        if self.use_contrast_channels:
            # Stored tiles are 2-channel VV/VH, already normalised to [0,1].
            # Local-contrast channels are computed on the fly here rather than
            # pre-materialised as a second copy of every tile on disk -- a
            # duplicate 4-channel tiles directory would need roughly the
            # dataset's full size again, which doesn't fit in the space
            # available. Denormalise back to dB (the exact inverse of
            # _normalise_channels), then reuse the same build_model_input
            # choke point training-tile prep and inference both use.
            db = image * (DB_MAX - DB_MIN) + DB_MIN
            image = build_model_input(db, use_contrast_channels=True)

        if self.transform is not None:
            augmented = self.transform(image=image, mask=mask)
            image, mask = augmented["image"], augmented["mask"]

        # HWC -> CHW for torch.
        image = np.ascontiguousarray(image.transpose(2, 0, 1))
        # int64 after augmentation, not before: albumentations does not preserve
        # the mask dtype, and cross_entropy rejects anything but Long targets.
        mask = np.ascontiguousarray(mask).astype(np.int64)
        return torch.from_numpy(image), torch.from_numpy(mask)



# Measured over the 139,873 training tiles: only 9.6% contain any oil at all,
# 26.7% are look-alike scenes, and 63.7% are ordinary open sea.
#
# An earlier, far more aggressive version of these targets (0.45/0.35/0.20) was
# measured on the held-out test set and made things worse, not better:
# look-alike false alarms went from 63.3% to 84.7% against the un-rebalanced
# baseline, buying only +0.05 median oil IoU. The reason is visible once the
# shares are expressed as inflation against natural frequency rather than as
# raw numbers: positives were inflated 4.68x while hard negatives — already
# common — were inflated only 1.31x. Showing the model that much more oil moves
# its prior toward calling things oil everywhere, which raises detections and
# false alarms together. That slides along a sensitivity/specificity curve; it
# does not teach the model to tell oil from a look-alike.
#
# So these are pulled back (positives now 2.6x natural) and, for the first time,
# the hard-negative share exceeds the positive share — the discrimination signal
# is meant to dominate, not the "there is probably oil here" signal.
TARGET_POSITIVE_SHARE = 0.25      # tiles containing oil (natural: 0.096)
TARGET_HARD_NEGATIVE_SHARE = 0.40  # look-alike scenes (natural: 0.267)
TARGET_EASY_NEGATIVE_SHARE = 0.35  # open sea, incl. empty parts of oil scenes

# Within the positives, weight grows with coverage so frame-filling slicks stop
# being a rounding error. Cut from 5.0: at that setting the 3,194 large-spill
# tiles absorbed 42.7% of the whole positive weight mass, roughly 252 repeat
# exposures each over a 30-epoch run, and measured large-spill recall did not
# improve for it — heavy repetition of a narrow subset is memorisation, not
# learning. At 1.5 a large spill still gets ~33% more exposure than an average
# positive tile.
COVERAGE_BOOST = 1.5

# Within the hard negatives, weight by measured confusability. Most look-alike
# tiles are easy open water that teach the model nothing it does not already
# know; the minority carrying a genuinely oil-like dark patch are the ones that
# produce false alarms, and under a uniform share they receive no more attention
# than the easy ones. This is the standard hard-negative-mining idea, and it is
# what the current state-of-the-art open dataset (GlobalOSD-SAR) used to build
# 82,100 of its ~100,134 negatives.
#
# Was 10.0. At that strength, with the no-data mining bug fixed (so this now
# concentrates on genuinely-confusable tiles instead of swath-edge artifacts),
# it measurably overshot: look-alike/clean-sea false alarms fell hard (49.3%->
# 33.3%, 20.0%->12.0%) but median oil IoU dropped to 84% of champion (0.5484->
# 0.4591), worst in the 5-20% coverage band -- ambiguous-but-real slicks, not
# boundary trimming. That's the fixed 40% hard-negative budget being
# concentrated too heavily onto ~493 tiles via sqrt(fp_fraction) rather than
# spread across the full look-alike pool; the budget share itself is untouched
# here, deliberately, to keep this a single-variable follow-up.
HARD_NEGATIVE_BOOST = 4.0

LARGE_SPILL_THRESHOLD = 0.20


def load_tile_oil_fractions(tiles_dir: Path, split: str) -> np.ndarray | None:
    """Per-tile oil fraction, precomputed by the stats pass."""
    path = tiles_dir / "tile_oil_fraction.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    if split not in data:
        return None
    return np.asarray(data[split], dtype=np.float32)


def load_tile_lookalike_fp(tiles_dir: Path, split: str) -> np.ndarray | None:
    """Per-tile false-positive fraction on look-alike tiles, from the mining pass.

    Written by the one-off hard-negative mining script: the fraction of each
    look-alike tile that a previous checkpoint wrongly called oil. Zero for
    every tile that is not a look-alike, so it can be indexed positionally
    against the split's tile list exactly like the oil fractions above.
    """
    path = tiles_dir / "tile_lookalike_fp.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    if split not in data:
        return None
    return np.asarray(data[split], dtype=np.float32)


def build_balanced_sampler(
    tiles: list[TileRef],
    oil_fraction: np.ndarray,
    lookalike_fp: np.ndarray | None = None,
) -> torch.utils.data.WeightedRandomSampler:
    """Sample tiles by what the model needs to learn, not by what is abundant.

    Draws with replacement over the same number of samples per epoch, so epoch
    cost is unchanged — only the composition of what is drawn changes.
    """
    oil_fraction = np.asarray(oil_fraction, dtype=np.float64)
    categories = np.array([t.category for t in tiles])

    positive = oil_fraction > 0
    hard_negative = (~positive) & (categories == "part2_lookalike")
    easy_negative = (~positive) & (~hard_negative)

    weights = np.zeros(len(tiles), dtype=np.float64)

    for group, share in (
        (positive, TARGET_POSITIVE_SHARE),
        (hard_negative, TARGET_HARD_NEGATIVE_SHARE),
        (easy_negative, TARGET_EASY_NEGATIVE_SHARE),
    ):
        count = int(group.sum())
        if count:
            # Each group's weights sum to its target share, so the share is what
            # the group actually receives regardless of how many tiles it holds.
            weights[group] = share / count

    # Redistribute inside the positives toward larger slicks.
    if positive.any():
        boost = 1.0 + COVERAGE_BOOST * oil_fraction[positive]
        weights[positive] *= boost
        weights[positive] *= TARGET_POSITIVE_SHARE / weights[positive].sum()

    # Redistribute inside the hard negatives toward the ones a previous model
    # actually got wrong. The group's total share is renormalised afterwards, so
    # this changes which look-alike tiles the budget is spent on, not how large
    # that budget is.
    if lookalike_fp is not None and hard_negative.any():
        # sqrt, not linear: only 1,745 of the 37,304 look-alike tiles fool the
        # model at all, and 67 of those are wrong across their whole area. A
        # linear boost hands most of the extra budget to that handful, which is
        # the same narrow-subset repetition that made COVERAGE_BOOST=5.0 fail.
        # sqrt lifts the many moderately-confusing tiles instead, spending the
        # budget on variety rather than on the few most extreme examples.
        boost = 1.0 + HARD_NEGATIVE_BOOST * np.sqrt(
            np.asarray(lookalike_fp, dtype=np.float64)[hard_negative]
        )
        weights[hard_negative] *= boost
        weights[hard_negative] *= TARGET_HARD_NEGATIVE_SHARE / weights[hard_negative].sum()

    logger.info(
        "Sampler: %d positive (%.1f%% -> %.0f%%), %d hard negative (%.1f%% -> %.0f%%), "
        "%d easy negative (%.1f%% -> %.0f%%); %d tiles over %.0f%% oil",
        positive.sum(), positive.mean() * 100, TARGET_POSITIVE_SHARE * 100,
        hard_negative.sum(), hard_negative.mean() * 100, TARGET_HARD_NEGATIVE_SHARE * 100,
        easy_negative.sum(), easy_negative.mean() * 100, TARGET_EASY_NEGATIVE_SHARE * 100,
        int((oil_fraction > LARGE_SPILL_THRESHOLD).sum()), LARGE_SPILL_THRESHOLD * 100,
    )
    if lookalike_fp is None:
        logger.warning(
            "No mined hard negatives; look-alike tiles are weighted uniformly. "
            "Run the hard-negative mining pass to enable confusability weighting."
        )
    else:
        mined = np.asarray(lookalike_fp, dtype=np.float64)[hard_negative]
        confusing = mined > 0
        logger.info(
            "Hard-negative mining: %d/%d look-alike tiles fooled the mining model "
            "(%.1f%%), taking %.0f%% of the hard-negative budget",
            int(confusing.sum()), len(mined), 100 * confusing.mean(),
            100 * weights[hard_negative][confusing].sum() / weights[hard_negative].sum(),
        )

    return torch.utils.data.WeightedRandomSampler(
        weights=torch.as_tensor(weights, dtype=torch.double),
        num_samples=len(tiles),
        replacement=True,
    )

def load_split(tiles_dir: Path, split: str) -> list[TileRef]:
    """Read one split's tile list from the manifest written by data_prep."""
    manifest = json.loads((tiles_dir / "manifest.json").read_text())
    return [
        TileRef(
            image_path=tiles_dir / entry["image"],
            mask_path=tiles_dir / entry["mask"],
            category=entry["category"],
        )
        for entry in manifest[split]
    ]


def class_pixel_counts(tiles: list[TileRef], sample_limit: int = 2000) -> np.ndarray:
    """Per-class pixel totals, for inverse-frequency loss weighting.

    Sampled rather than exhaustive: the ratios are stable well before the full
    set is read, and reading every tile to compute a weight vector would cost
    more than it informs.
    """
    counts = np.zeros(NUM_CLASSES, dtype=np.int64)
    step = max(1, len(tiles) // sample_limit)
    for ref in tiles[::step]:
        mask = np.load(ref.mask_path)
        # IGNORE_INDEX (255) pixels are not an observation of either class, so
        # they must not inflate bincount's output past NUM_CLASSES entries --
        # np.bincount sizes its result by the largest value present, and with
        # 255 left in there that silently returns a length-256 array instead
        # of length-NUM_CLASSES, breaking the += accumulation below.
        labels = mask[mask < NUM_CLASSES]
        counts += np.bincount(labels.ravel(), minlength=NUM_CLASSES)
    return counts
