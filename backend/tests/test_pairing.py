"""Regression tests for image/mask pairing.

Both cases here were found in the real archives and both fail *silently* — they
produce a full-looking dataset that is quietly mislabelled, which training would
happily converge on.
"""

from pathlib import Path

from app.ml.data_prep import SourcePair, _find_files, _is_junk, _pair_files


def test_macos_resource_forks_are_rejected():
    # The SOS archives were built on macOS and carry an AppleDouble stub beside
    # every real file. `._palsar_0.png` matches an image extension and pairs
    # cleanly against a real mask, so a suffix-only filter admits ~8,000 200-byte
    # binary stubs as training images.
    assert _is_junk(Path("__MACOSX/masks/._palsar_0.png"))
    assert _is_junk(Path("masks/train/._palsar_0.png"))
    assert _is_junk(Path("masks/.DS_Store"))
    assert not _is_junk(Path("masks/train/palsar_0.png"))


def test_find_files_excludes_junk(tmp_path):
    real = tmp_path / "train" / "palsar_0.png"
    real.parent.mkdir(parents=True)
    real.write_bytes(b"x")
    (tmp_path / "train" / "._palsar_0.png").write_bytes(b"junk")
    (tmp_path / "__MACOSX").mkdir()
    (tmp_path / "__MACOSX" / "._palsar_1.png").write_bytes(b"junk")

    found = _find_files(tmp_path)
    assert found == [real]


def test_same_number_across_naming_families_never_cross_pairs():
    # Refined-SOS carries palsar_* and sentinel_* families that reuse the same
    # numbers — 3,101 colliding ids in the real dataset. Pairing on the trailing
    # number alone hands sentinel_5's image the mask belonging to palsar_5.
    images = [Path("images/train/palsar_5.png"), Path("images/train/sentinel_5.png")]
    masks = [Path("masks/train/palsar_5.png"), Path("masks/train/sentinel_5.png")]

    out: list[SourcePair] = []
    matched, _ = _pair_files(images, masks, "refined_sos", out)

    assert matched == 2
    for pair in out:
        assert pair.image.stem == pair.mask.stem


def test_train_and_val_reuse_the_same_ids_without_cross_pairing():
    # palsar_0 exists in both train/ and val/; a pairing that ignores the split
    # subdirectory can match an image in one to a mask in the other.
    images = [Path("images/train/palsar_0.png"), Path("images/val/palsar_0.png")]
    masks = [Path("masks/train/palsar_0.png"), Path("masks/val/palsar_0.png")]

    out: list[SourcePair] = []
    matched, _ = _pair_files(images, masks, "refined_sos", out)

    assert matched == 2
    for pair in out:
        image_split = "train" if "train" in pair.image.parts else "val"
        mask_split = "train" if "train" in pair.mask.parts else "val"
        assert image_split == mask_split


def test_zenodo_style_differing_names_still_pair_on_number():
    # Zenodo names them differently and shares only the trailing id, so the
    # numeric fallback has to survive the fix for the collision case above.
    images = [Path("images/Oil_Spill_0042.tif")]
    masks = [Path("masks/mask_0042.tif")]

    out: list[SourcePair] = []
    matched, _ = _pair_files(images, masks, "part1_oil", out)

    assert matched == 1
    assert out[0].mask.name == "mask_0042.tif"


def test_ambiguous_number_is_dropped_rather_than_guessed():
    # Two masks share the id and neither matches by name: pairing is genuinely
    # ambiguous. Losing one sample is cheap; training on a wrong label is not.
    images = [Path("images/scene_7.tif")]
    masks = [Path("masks/alpha_7.tif"), Path("masks/beta_7.tif")]

    out: list[SourcePair] = []
    matched, unpairable = _pair_files(images, masks, "part1_oil", out)

    assert matched == 0
    assert unpairable == 1


def test_exact_name_match_wins_over_numeric_match():
    images = [Path("images/train/palsar_3.png")]
    masks = [Path("masks/train/palsar_3.png"), Path("masks/train/sentinel_3.png")]

    out: list[SourcePair] = []
    matched, _ = _pair_files(images, masks, "refined_sos", out)

    assert matched == 1
    assert out[0].mask.name == "palsar_3.png"
