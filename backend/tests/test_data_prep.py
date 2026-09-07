from pathlib import Path

import numpy as np
import pytest

from app.ml.data_prep import SourcePair, _numeric_key, _to_class_mask, assign_splits
from app.ml.classes import OIL, SEA


def test_pairs_image_to_mask_by_shared_number_not_filename():
    # Zenodo names an image and its mask differently but shares a sample number,
    # so matching on stem would pair nothing at all.
    assert _numeric_key(Path("Oil_Spill_0042.tif")) == _numeric_key(Path("mask_0042.tif"))


def test_numeric_key_ignores_leading_zeros():
    assert _numeric_key(Path("img_0007.tif")) == _numeric_key(Path("mask_7.tif"))


def test_numeric_key_uses_last_number_in_name():
    # Product names embed several numbers; the sample id is the trailing one.
    assert _numeric_key(Path("S1A_2018_scene_0123.tif")) == "123"


def test_numeric_key_returns_none_without_a_number():
    assert _numeric_key(Path("no_digits_here.tif")) is None


def test_lookalike_scenes_are_labelled_entirely_sea():
    # Zenodo's look-alike masks are all zero -- their ground truth only traced
    # oil -- so these scenes act as hard negatives. A look-alike pixel must never
    # come out as OIL, which is exactly what the model has to learn not to do.
    binary = np.array([[0, 1], [1, 0]], dtype=np.uint8)
    mask = _to_class_mask(binary, "part2_lookalike")
    assert (mask == SEA).all()


def test_oil_foreground_maps_to_oil_class():
    binary = np.array([[0, 1], [1, 0]], dtype=np.uint8)
    mask = _to_class_mask(binary, "part1_oil")
    assert mask[0, 1] == OIL


def test_nooil_scenes_are_entirely_background():
    # These masks ship all-zero, but guard the mapping anyway: labelling a
    # no-oil scene's pixels as anything but sea would poison the hard negatives.
    binary = np.array([[1, 1], [1, 1]], dtype=np.uint8)
    mask = _to_class_mask(binary, "part2_nooil")
    assert (mask == SEA).all()


def _pairs(category: str, count: int) -> list[SourcePair]:
    return [
        SourcePair(
            image=Path(f"/raw/{category}/img_{i}.tif"),
            mask=Path(f"/raw/{category}/msk_{i}.tif"),
            category=category,
        )
        for i in range(count)
    ]


def test_split_assigns_every_source_image():
    pairs = _pairs("part1_oil", 100) + _pairs("part2_lookalike", 50)
    assignment = assign_splits(pairs)
    assert len(assignment) == 150
    assert set(assignment.values()) == {"train", "val"}


def test_split_holds_out_roughly_the_configured_fraction():
    pairs = _pairs("part1_oil", 200)
    assignment = assign_splits(pairs)
    val = sum(1 for split in assignment.values() if split == "val")
    assert 20 <= val <= 40  # ~15% of 200, with rounding latitude


def test_split_is_stratified_across_categories():
    # A category left entirely out of validation would go unmeasured; the
    # look-alike class especially, which is the hard part of the task.
    pairs = _pairs("part1_oil", 60) + _pairs("part2_lookalike", 60)
    assignment = assign_splits(pairs)
    for category in ("part1_oil", "part2_lookalike"):
        val = [
            path
            for path, split in assignment.items()
            if split == "val" and category in str(path)
        ]
        assert val, f"{category} has no validation images"


def test_split_is_reproducible_across_runs():
    # A shifting split would quietly move previously-validated images into
    # training on a re-run, invalidating every comparison against earlier scores.
    pairs = _pairs("part1_oil", 80)
    assert assign_splits(pairs) == assign_splits(pairs)
