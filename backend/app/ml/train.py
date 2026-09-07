"""Training loop for the oil-slick segmentation model."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from app.config import get_settings
from app.ml.dataset import (
    CLASS_NAMES,
    LARGE_SPILL_THRESHOLD,
    NUM_CLASSES,
    NUM_CONTRAST_CHANNELS,
    NUM_POLARISATIONS,
    OIL,
    SlickTileDataset,
    build_balanced_sampler,
    class_pixel_counts,
    load_split,
    load_tile_lookalike_fp,
    load_tile_oil_fractions,
)
from app.ml.model import FocalDiceLoss, build_model, sqrt_inverse_frequency_weights

logger = logging.getLogger(__name__)


def confusion_update(
    matrix: np.ndarray, predicted: torch.Tensor, target: torch.Tensor
) -> None:
    """Accumulate a confusion matrix; IoU is derived from it afterwards.

    Accumulating counts rather than averaging per-batch IoU matters: a batch
    containing no oil pixels has an undefined oil IoU, and averaging over
    batches would either skip or zero those, both of which distort the result.
    """
    k = (target >= 0) & (target < NUM_CLASSES)
    matrix += np.bincount(
        NUM_CLASSES * target[k].astype(int) + predicted[k],
        minlength=NUM_CLASSES**2,
    ).reshape(NUM_CLASSES, NUM_CLASSES)


def iou_from_confusion(matrix: np.ndarray) -> dict[str, float]:
    intersection = np.diag(matrix)
    union = matrix.sum(axis=1) + matrix.sum(axis=0) - intersection
    with np.errstate(divide="ignore", invalid="ignore"):
        iou = np.where(union > 0, intersection / union, np.nan)
    return {CLASS_NAMES[i]: float(iou[i]) for i in range(NUM_CLASSES)}


def selection_metric(class_iou: dict[str, float]) -> float:
    """Oil-class IoU — the only number worth selecting a checkpoint on.

    Sea is 98.5% of all pixels, so its IoU sits above 0.95 from the first epoch
    and a mean over both classes would be dominated by a class that is trivially
    easy. Oil IoU is the metric that actually moves as the model improves.
    """
    value = class_iou[CLASS_NAMES[OIL]]
    return 0.0 if np.isnan(value) else float(value)


@torch.no_grad()
def validate(
    model,
    loader,
    device,
    loss_fn,
    tiles: list | None = None,
    oil_fraction: np.ndarray | None = None,
) -> tuple[float, dict[str, float], dict[str, float]]:
    """Validate, and report the error modes IoU alone cannot show.

    Oil IoU says how well real slicks are outlined; it says nothing about how
    often the model cries wolf on a look-alike, which is the failure this
    project actually cares about and the one that got worse in two successive
    retrains without being visible until a separate evaluation pass hours later.

    So this also reports, per epoch and at no extra forward cost, the fraction
    of look-alike and clean-sea tiles the model puts any oil pixel in at all,
    plus recall on the large-spill tiles the sampler is meant to help. The val
    loader is unshuffled and unsampled, so a running cursor lines batches up
    with `tiles` positionally, the same convention the sampler already uses.

    These are 256px tile-level proxies on the val split, not the full-scene
    sliding-window numbers evaluate.py produces on the held-out test set. They
    exist to catch a trend early, not to replace that pass.
    """
    model.eval()
    matrix = np.zeros((NUM_CLASSES, NUM_CLASSES), dtype=np.int64)
    total_loss = 0.0
    batches = 0

    fired: dict[str, list[bool]] = {}
    large_spill_hits: list[bool] = []
    cursor = 0

    for images, masks in loader:
        images = images.to(device, non_blocking=True)
        masks = masks.to(device, non_blocking=True)
        with torch.autocast(device_type=device.type, dtype=torch.float16):
            logits = model(images)
            loss = loss_fn(logits, masks)
        total_loss += loss.item()
        batches += 1

        predicted = logits.argmax(dim=1)
        confusion_update(
            matrix, predicted.cpu().numpy().ravel(), masks.cpu().numpy().ravel()
        )

        if tiles is not None:
            any_oil = (predicted == OIL).any(dim=2).any(dim=1).cpu().numpy()
            for hit in any_oil:
                if cursor < len(tiles):
                    fired.setdefault(tiles[cursor].category, []).append(bool(hit))
                    if (
                        oil_fraction is not None
                        and cursor < len(oil_fraction)
                        and oil_fraction[cursor] > LARGE_SPILL_THRESHOLD
                    ):
                        large_spill_hits.append(bool(hit))
                cursor += 1

    signals = {
        f"{category}_fire_rate": float(np.mean(hits))
        for category, hits in fired.items()
    }
    if large_spill_hits:
        signals["large_spill_recall"] = float(np.mean(large_spill_hits))

    return total_loss / max(batches, 1), iou_from_confusion(matrix), signals


def run(
    data_dir: Path,
    epochs: int = 40,
    batch_size: int = 24,
    lr: float = 1e-4,
    encoder: str = "resnet34",
    num_workers: int = 6,
    resume: Path | None = None,
    tag: str = "",
    radiometric_shift: bool = True,
    use_contrast_channels: bool = False,
    tiles_dir: Path | None = None,
) -> dict:
    settings = get_settings()
    # Defaults to data_dir/tiles, matching every prior run's convention;
    # overridable so an alternate tiles directory (e.g. one produced by
    # radiometric.migrate_tiles_add_contrast) doesn't need to be relocated
    # into that exact layout first.
    tiles_dir = tiles_dir if tiles_dir is not None else data_dir / "tiles"

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cpu":
        logger.warning("CUDA unavailable — training on CPU will be impractically slow.")
    else:
        capability = torch.cuda.get_device_capability()
        logger.info(
            "GPU: %s (sm_%d%d)", torch.cuda.get_device_name(), capability[0], capability[1]
        )

    train_tiles = load_split(tiles_dir, "train")
    val_tiles = load_split(tiles_dir, "val")
    logger.info("Tiles: %d train, %d val", len(train_tiles), len(val_tiles))

    # Channel count is always derived from what's actually on disk, never
    # blindly added to -- a directory already migrated by
    # radiometric.migrate_tiles_add_contrast is NUM_POLARISATIONS+NUM_CONTRAST_CHANNELS
    # wide on its own; use_contrast_channels only means something for a plain
    # NUM_POLARISATIONS-wide directory, where it requests on-the-fly expansion
    # in SlickTileDataset instead. Deriving in_channels by unconditionally
    # adding NUM_CONTRAST_CHANNELS whenever the flag was passed double-counted
    # channels the first time this ran against an already-migrated directory
    # (produced a 6-channel model) -- this shape check is what prevents that
    # from being silent.
    stored_channels = int(np.load(train_tiles[0].image_path).shape[-1])
    expand_on_the_fly = use_contrast_channels and stored_channels == NUM_POLARISATIONS
    if use_contrast_channels and not expand_on_the_fly and stored_channels != NUM_POLARISATIONS + NUM_CONTRAST_CHANNELS:
        raise ValueError(
            f"--use-contrast-channels was given but the tiles at {tiles_dir} have "
            f"{stored_channels} channels, which is neither a plain "
            f"{NUM_POLARISATIONS}-channel directory (on-the-fly expansion) nor an "
            f"already-migrated {NUM_POLARISATIONS + NUM_CONTRAST_CHANNELS}-channel "
            f"one -- refusing to guess how to build a model for it."
        )
    in_channels = stored_channels + (NUM_CONTRAST_CHANNELS if expand_on_the_fly else 0)
    # The wide radiometric dB-shift augmentation is only valid on the raw
    # polarisation channels -- local-contrast channels are already
    # shift-invariant by construction and must not be perturbed the same way
    # (see dataset._apply_db_shift).
    shift_channels = NUM_POLARISATIONS if in_channels > NUM_POLARISATIONS else None
    logger.info(
        "Model input channels: %d%s", in_channels,
        f" (dB-shift restricted to first {shift_channels})" if shift_channels else "",
    )

    # Balanced sampling replaces shuffle: drawing uniformly means ~90% of every
    # batch is oil-free, which is what the previous run learned from and why it
    # both over-fired on look-alikes and missed frame-filling spills.
    oil_fraction = load_tile_oil_fractions(tiles_dir, "train")
    lookalike_fp = load_tile_lookalike_fp(tiles_dir, "train")
    if lookalike_fp is not None and len(lookalike_fp) != len(train_tiles):
        logger.warning(
            "Mined hard negatives cover %d tiles but the train split has %d; "
            "ignoring them rather than misaligning the weights.",
            len(lookalike_fp), len(train_tiles),
        )
        lookalike_fp = None
    sampler = None
    if oil_fraction is not None and len(oil_fraction) == len(train_tiles):
        sampler = build_balanced_sampler(train_tiles, oil_fraction, lookalike_fp)
    else:
        logger.warning(
            "No per-tile oil fractions for the train split; falling back to "
            "uniform shuffling. Run the tile-stats pass to enable balancing."
        )

    train_loader = DataLoader(
        SlickTileDataset(
            train_tiles, augment=True,
            radiometric_shift=radiometric_shift, num_level_channels=shift_channels,
            use_contrast_channels=expand_on_the_fly,
        ),
        batch_size=batch_size,
        sampler=sampler,
        shuffle=sampler is None,
        num_workers=num_workers,
        pin_memory=device.type == "cuda",
        persistent_workers=num_workers > 0,
        drop_last=True,
    )
    val_loader = DataLoader(
        SlickTileDataset(val_tiles, augment=False, use_contrast_channels=expand_on_the_fly),
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=device.type == "cuda",
        persistent_workers=num_workers > 0,
    )
    # Unshuffled and unsampled above, so validate() can line predictions up with
    # val_tiles by position and report per-category false-alarm rates.
    val_oil_fraction = load_tile_oil_fractions(tiles_dir, "val")
    if val_oil_fraction is not None and len(val_oil_fraction) != len(val_tiles):
        val_oil_fraction = None

    counts = class_pixel_counts(train_tiles)
    weights = sqrt_inverse_frequency_weights(counts, device)
    logger.info("Class pixel counts: %s", dict(zip(CLASS_NAMES.values(), counts.tolist())))
    # Logged but deliberately not applied. Pixel-level class weighting is
    # computed from the *natural* class frequencies and knows nothing about what
    # the sampler already did to batch composition, so switching it on stacks a
    # second correction on top of the first. Measured: doing exactly that
    # produced the worst oil IoU (0.3385) and worst clean-sea false-alarm rate
    # (28.0%) of every run in this project. Kept visible here so the imbalance
    # it was reacting to stays legible, and so a later ablation can re-enable it
    # deliberately rather than rediscovering the number.
    logger.info("Class weights (computed, NOT applied): %s", weights.tolist())

    model = build_model(encoder=encoder, in_channels=in_channels).to(device)
    loss_fn = FocalDiceLoss(class_weights=None).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    scaler = torch.amp.GradScaler(device.type, enabled=device.type == "cuda")

    checkpoint_dir = Path(settings.ml_checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    # The tag keeps a methodology change in its own checkpoint rather than
    # overwriting the previous run's, so the two can actually be compared.
    version = f"deeplabv3plus_{encoder}_{stamp}" + (f"_{tag}" if tag else "")
    checkpoint_path = checkpoint_dir / f"{version}.pt"
    best_epoch = -1

    start_epoch = 0
    best_metric = 0.0

    # Auto-resume: pick up an interrupted run of this same version without
    # needing --resume passed, so a long unattended job survives a restart.
    if resume is None:
        auto = checkpoint_dir / f"{version}_last.pt"
        if auto.exists():
            resume = auto
            logger.info("Found an interrupted run for %s; resuming it", version)

    if resume is not None and not resume.exists():
        # Explicitly refuse rather than quietly starting over. A mistyped path
        # would otherwise discard hours of training and look like a normal run
        # — which is exactly what happened once, when a shell rewrote /data/...
        # into a host path before it ever reached the container.
        raise FileNotFoundError(
            f"--resume points at {resume}, which does not exist. Refusing to "
            f"silently restart from scratch."
        )

    if resume is not None:
        checkpoint = torch.load(resume, map_location=device, weights_only=False)
        model.load_state_dict(checkpoint["model_state_dict"])
        start_epoch = checkpoint.get("epoch", -1) + 1
        best_metric = checkpoint.get("best_metric", checkpoint.get("val_metric", 0.0))
        for key, obj in (
            ("optimizer_state_dict", optimizer),
            ("scheduler_state_dict", scheduler),
            ("scaler_state_dict", scaler),
        ):
            if key in checkpoint:
                obj.load_state_dict(checkpoint[key])
        logger.info(
            "Resumed from %s at epoch %d (best so far %.4f)",
            resume, start_epoch, best_metric,
        )

    for epoch in range(start_epoch, epochs):
        model.train()
        epoch_start = time.time()
        running_loss = 0.0

        for step, (images, masks) in enumerate(train_loader):
            images = images.to(device, non_blocking=True)
            masks = masks.to(device, non_blocking=True)

            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device.type, dtype=torch.float16):
                loss = loss_fn(model(images), masks)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

            running_loss += loss.item()
            if step % 100 == 0:
                logger.info(
                    "epoch %d step %d/%d loss %.4f",
                    epoch, step, len(train_loader), loss.item(),
                )

        scheduler.step()
        val_loss, class_iou, signals = validate(
            model, val_loader, device, loss_fn, val_tiles, val_oil_fraction
        )
        metric = selection_metric(class_iou)
        elapsed = time.time() - epoch_start

        logger.info(
            "epoch %d done in %.1fs | train_loss %.4f | val_loss %.4f | IoU %s | metric %.4f",
            epoch, elapsed, running_loss / max(len(train_loader), 1), val_loss,
            {k: round(v, 3) for k, v in class_iou.items()}, metric,
        )
        # Separate line, because this is the signal two previous retrains needed
        # and did not have: whether false alarms are trending up while IoU also
        # trends up, which is the fingerprint of a model getting more trigger-happy
        # rather than more discriminating.
        logger.info(
            "  false-alarm watch | look-alike %.1f%% | clean-sea %.1f%% | large-spill recall %.1f%%",
            100 * signals.get("part2_lookalike_fire_rate", float("nan")),
            100 * signals.get("part2_nooil_fire_rate", float("nan")),
            100 * signals.get("large_spill_recall", float("nan")),
        )


        if metric > best_metric:
            best_metric = metric
            best_epoch = epoch
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "epoch": epoch,
                    "val_metric": metric,
                    "class_iou": class_iou,
                    "config": {
                        "encoder": encoder,
                        "tile_size": settings.ml_tile_size,
                        "num_classes": NUM_CLASSES,
                        "num_channels": in_channels,
                        "version": version,
                    },
                },
                checkpoint_path,
            )
            logger.info("New best (%.4f) — checkpoint saved to %s", metric, checkpoint_path)

        # Written after the best-check, not before, so best_metric is already
        # current. Writing it first records a stale value: a resume then thinks
        # the bar is lower than it is, and a worse epoch overwrites a better
        # saved checkpoint.
        torch.save(
            {
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "scheduler_state_dict": scheduler.state_dict(),
                "scaler_state_dict": scaler.state_dict(),
                "epoch": epoch,
                "best_metric": best_metric,
                "config": {"encoder": encoder, "num_channels": in_channels, "version": version},
            },
            checkpoint_dir / f"{version}_last.pt",
        )

    return {
        "best_metric": best_metric,
        "best_epoch": best_epoch,
        "checkpoint_path": str(checkpoint_path),
        "model_version": version,
    }
