"""Model construction and the loss used to train it."""

from __future__ import annotations

import segmentation_models_pytorch as smp
import torch
from torch import nn

from app.ml.classes import IGNORE_INDEX
from app.ml.dataset import NUM_CHANNELS, NUM_CLASSES


def build_model(
    encoder: str = "resnet34", pretrained: bool = True, in_channels: int = NUM_CHANNELS
) -> nn.Module:
    """DeepLabv3+ with an ImageNet-pretrained encoder.

    DeepLabv3+ over plain U-Net for the atrous spatial pyramid: slicks appear at
    wildly different scales in one scene, and the dilated convolutions widen the
    receptive field without the resolution loss that repeated downsampling costs.

    ResNet34 over something heavier because the whole budget is one 8 GB card,
    shared with the rest of the pipeline.

    The ImageNet weights are a real head start even though ImageNet is RGB
    photographs and this is radar backscatter (2-channel VV/VH, or 4 with
    local-contrast channels added -- see radiometric.py): the early layers
    learn edges, gradients, and texture, which transfer. Everything
    task-specific — the entire decoder, and telling oil from a look-alike — is
    learned here from scratch. smp adapts the pretrained first conv to
    `in_channels` by averaging across the original 3 input channels, so this
    works directly regardless of channel count; `in_channels` defaults to the
    historical VV/VH width but callers building or loading a model with a
    different channel count (e.g. from a checkpoint's recorded config) must
    pass it explicitly rather than relying on this default.
    """
    return smp.DeepLabV3Plus(
        encoder_name=encoder,
        encoder_weights="imagenet" if pretrained else None,
        in_channels=in_channels,
        classes=NUM_CLASSES,
    )


class FocalDiceLoss(nn.Module):
    """Focal loss plus Dice, for a task dominated by easy negatives.

    Replaces plain weighted cross-entropy, which measured badly here: it treats
    every pixel as equally worth learning from, so with ~90% of tiles containing
    no oil at all, the gradient is dominated by open sea the model already
    classifies at 0.99 IoU. Focal's (1-p)^gamma factor down-weights exactly
    those confident-and-correct pixels, concentrating the update on the
    genuinely ambiguous ones — which is precisely the oil-versus-look-alike
    boundary this model was getting wrong 60% of the time.

    Dice is retained alongside it, still optimising region overlap directly so a
    small slick counts for its shape rather than its pixel count.
    """

    def __init__(
        self,
        class_weights: torch.Tensor | None = None,
        dice_weight: float = 0.5,
        gamma: float = 2.0,
    ) -> None:
        super().__init__()
        # reduction="none" keeps a per-pixel loss tensor rather than smp's own
        # mean, because its `alpha` parameter is a single scalar -- workable for
        # true binary focal loss, but not the right shape for a per-class weight
        # vector, and unclear enough in multiclass mode that guessing at its
        # semantics is worse than just applying the weights explicitly below.
        #
        # ignore_index is deliberately NOT passed to smp's FocalLoss here: under
        # multiclass mode with reduction="none", its own ignore-index path
        # flattens and filters the per-class tensors before returning them,
        # losing the (N, H, W) shape this class's pixel_weight gather depends
        # on. No-data exclusion is done explicitly below instead, on the full
        # unfiltered per-pixel tensor.
        self.focal = smp.losses.FocalLoss(mode="multiclass", gamma=gamma, reduction="none")
        # DiceLoss's own ignore_index masks out no-data pixels from both the
        # prediction and the one-hot target before the intersection/union sums,
        # so no-data contributes nothing to the score -- safe to use directly.
        self.dice = smp.losses.DiceLoss(
            mode="multiclass", from_logits=True, ignore_index=IGNORE_INDEX
        )
        self.dice_weight = dice_weight
        self.register_buffer(
            "class_weights",
            class_weights if class_weights is not None else torch.ones(NUM_CLASSES),
        )

    def forward(self, logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        per_pixel = self.focal(logits, target)  # (N, H, W)
        # No-data pixels carry IGNORE_INDEX, not a real class id, so indexing
        # class_weights with them directly would go out of bounds. Substitute
        # a dummy in-range class for the gather, then zero their weight -- the
        # substituted value never matters because it's multiplied out.
        valid = target != IGNORE_INDEX
        safe_target = torch.where(valid, target, torch.zeros_like(target))
        pixel_weight = self.class_weights[safe_target] * valid.to(per_pixel.dtype)
        focal_loss = (per_pixel * pixel_weight).sum() / pixel_weight.sum().clamp(min=1.0)
        return (1 - self.dice_weight) * focal_loss + self.dice_weight * self.dice(
            logits, target
        )


class DiceCrossEntropyLoss(nn.Module):
    """Weighted cross-entropy plus Dice.

    Oil is a small minority of pixels even in scenes that contain it, so plain
    cross-entropy is happiest predicting "sea" everywhere — a model that scores
    high on pixel accuracy and is useless. The class weights push back per
    pixel; Dice pushes back per region, optimising overlap directly so a small
    slick counts for as much as its shape deserves rather than for its pixel
    count.
    """

    def __init__(self, class_weights: torch.Tensor, dice_weight: float = 0.5) -> None:
        super().__init__()
        self.cross_entropy = nn.CrossEntropyLoss(weight=class_weights)
        self.dice = smp.losses.DiceLoss(mode="multiclass", from_logits=True)
        self.dice_weight = dice_weight

    def forward(self, logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        return (1 - self.dice_weight) * self.cross_entropy(
            logits, target
        ) + self.dice_weight * self.dice(logits, target)


def sqrt_inverse_frequency_weights(
    pixel_counts, device: torch.device | str = "cpu"
) -> torch.Tensor:
    """Softened class weights: the square root of the inverse-frequency ratio.

    Raw inverse frequency gave oil a ~1.9x weight against sea's ~0.05x, which
    was measured to overcorrect — the model became willing to call any dark
    patch oil, producing a 60% false-alarm rate on look-alike scenes. Taking the
    square root keeps the correction (oil still outweighs sea) while roughly
    halving its aggression in log terms.

    The tile-level sampler now carries most of the rebalancing work, so this no
    longer has to fight the full 98:2 pixel imbalance by itself.
    """
    counts = torch.as_tensor(pixel_counts, dtype=torch.float32)
    counts = torch.clamp(counts, min=1.0)
    weights = torch.sqrt(counts.sum() / (len(counts) * counts))
    weights = torch.clamp(weights, max=20.0)
    weights = weights / weights.mean()
    return weights.to(device)


def inverse_frequency_weights(
    pixel_counts, device: torch.device | str = "cpu"
) -> torch.Tensor:
    """Class weights from observed pixel frequencies, normalised to mean 1.

    Clamped because the raw ratio between sea and oil pixels can reach several
    hundred to one, and a weight that large makes every oil pixel dominate the
    gradient enough to destabilise training.
    """
    counts = torch.as_tensor(pixel_counts, dtype=torch.float32)
    counts = torch.clamp(counts, min=1.0)
    weights = counts.sum() / (len(counts) * counts)
    weights = torch.clamp(weights, max=20.0)
    weights = weights / weights.mean()
    return weights.to(device)
