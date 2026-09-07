"""The segmentation class scheme.

Deliberately dependency-free. Data preparation, post-processing and persistence
all need to agree on what class 1 means, but none of them needs torch or
albumentations — keeping these constants beside the training machinery would
force the whole ML stack into every module that touches a label.
"""

from __future__ import annotations

# Binary by necessity, not by choice.
#
# Zenodo's look-alike masks are entirely zero — verified across the full set,
# not assumed — because their ground truth only ever traced oil. Their own Part
# II note says as much: "the value of the ground truth of the look-alike images
# is only 0". So there is no look-alike annotation anywhere to learn a third
# class from, and giving the model an output channel that can never activate
# would waste capacity and leave its IoU permanently undefined.
#
# The look-alike scenes still matter enormously — they are the hard negatives.
# A low-wind patch or an algal bloom reads dark in SAR exactly like oil, and
# these are full scenes of precisely that, labelled all-background. Training on
# them is what teaches the model not to fire on them, which is the actual hard
# part of this task.
SEA = 0
OIL = 1

CLASS_NAMES = {SEA: "sea", OIL: "oil"}
NUM_CLASSES = 2

# Sentinel-1 dual-pol: VV and VH. This is the DEFAULT model input width and
# stays 2 for backward compatibility with every existing checkpoint -- a model
# using local-contrast channels too (see radiometric.py) passes its own
# in_channels explicitly (NUM_POLARISATIONS + NUM_CONTRAST_CHANNELS) rather
# than changing this constant, so bumping it here can never silently break
# code that assumes 2-channel VV/VH input.
NUM_CHANNELS = 2

# Physical channels actually read from the SAR product -- always 2 (VV, VH),
# regardless of how many total channels a given model takes as input. This is
# what inference._select_polarisations must iterate over; conflating it with
# the model's total input width (NUM_CHANNELS above) breaks the moment a model
# adds derived channels that aren't additional polarisations.
NUM_POLARISATIONS = 2
# Local-contrast (CFAR-style) channels added per polarisation -- see
# radiometric.py. 0 for a plain VV/VH model, 2 for one that also takes
# local-contrast input.
NUM_CONTRAST_CHANNELS = 2

# The Zenodo parts ship one binary mask per source category rather than a single
# multi-class map: oil masks trace oil, while the no-oil and look-alike parts
# ship all-zero masks because the ground truth only ever traced oil. So the
# source category is what says which class a foreground pixel belongs to, and
# the look-alike part is the only place class 2 can come from.
CATEGORY_FOREGROUND = {
    "part1_oil": OIL,
    # Both of these ship all-zero masks, so nothing here ever becomes
    # foreground. Mapping them to SEA states that explicitly rather than
    # relying on the masks happening to be empty.
    "part2_lookalike": SEA,
    "part2_nooil": SEA,
    "refined_sos": OIL,
}

# Refined-SOS is deliberately excluded from training.
#
# Zenodo ships 2-band float32 Sigma0 in dB (about -54 to +5), which is the
# physical quantity a Sentinel-1 product yields once calibrated. Refined-SOS
# ships 3-band uint8 PNGs — visualisation renderings with an unknown contrast
# stretch already baked in, from which the underlying dB values cannot be
# recovered.
#
# The inference path calibrates real scenes to Sigma0 dB, so training on
# 8-bit renderings would fit the model to a distribution it never meets in
# production. Its masks are perfectly good; the imagery is the wrong
# representation. Usable later as a robustness or fine-tuning set with its own
# normalisation, not as part of this training mix.
TRAINING_CATEGORIES = ("part1_oil", "part2_lookalike", "part2_nooil")

# Physical range of Sentinel-1 Sigma0 in dB, used to normalise into [0, 1].
# Fixed rather than per-tile so a given dB value means the same thing to the
# model in every tile.
DB_MIN = -40.0
DB_MAX = 0.0

# Fixed clip range for local-contrast (windowed z-score) channels, used to
# normalise them into [0, 1] the same way DB_MIN/DB_MAX normalise dB -- but
# measured empirically from this project's training tiles rather than assumed
# by analogy: a 40-tile sample of the local z-score distribution had mean
# ~0.004, std ~0.93, 99.9th percentile ~2.85, and an observed range of about
# [-4.8, 5.7]. +-4.0 covers the great majority of that range, including most
# of the informative oil/sea-edge extremes, while still bounding it.
Z_MIN = -4.0
Z_MAX = 4.0

# Label for pixels with no real SAR observation to learn from: the rotated
# swath is padded to a rectangle, and the padding carries a constant raw 0.0 dB
# sentinel in both VV and VH simultaneously (confirmed empirically — wherever
# one channel hits exactly 0.0, the other always does too, across a sample of
# 60 source images with zero exceptions). Left unmasked, that padding is
# labelled an ordinary "sea" pixel purely because CATEGORY_FOREGROUND defaults
# everything not traced as oil to SEA — training the model that a hard-edged
# rectangular block of maximum backscatter is open water. 255 rather than a
# small int so it can never collide with a real class id as NUM_CLASSES grows.
IGNORE_INDEX = 255
