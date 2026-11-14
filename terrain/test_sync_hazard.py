# Written with AI assistance (Claude).
"""Checks for terrain/sync_hazard.py on a tiny fake grid (no real data needed)."""
import json

import numpy as np
from jsonschema import Draft202012Validator

from terrain.sync_hazard import ROOT, sync


def _setup(tmp_path, w=4, h=3):
    src, out = tmp_path / "model", tmp_path / "terrain"
    src.mkdir(); out.mkdir()
    np.linspace(0, 1, w * h, dtype="<f4").tofile(src / "hazard.bin")
    (src / "hazard.png").write_bytes(b"png")
    meta = json.loads((ROOT / "model/out/hazard.meta.json").read_text())
    meta.update(width=w, height=h)
    (src / "hazard.meta.json").write_text(json.dumps(meta))
    (out / "grid.json").write_text(json.dumps({"width": w, "height": h, "cell_m": 2.0}))
    (out / "layers.manifest.json").write_text(json.dumps({"frame": "jezero-local-v1", "layers": [
        {"id": "dem", "name": "Elevation", "file": "dem.bin", "kind": "raster", "source": "s", "licence": "l", "citation": "c"}]}))
    return src, out


def test_sync_copies_and_adds_one_manifest_entry(tmp_path):
    src, out = _setup(tmp_path)
    sync(src, out); sync(src, out)                     # twice: entry must not be duplicated
    assert (out / "hazard.bin").read_bytes() == (src / "hazard.bin").read_bytes()
    man = json.loads((out / "layers.manifest.json").read_text())
    assert [l["id"] for l in man["layers"]] == ["dem", "hazard"]
    schema = json.loads((ROOT / "contracts/layers.manifest.schema.json").read_text())
    assert not list(Draft202012Validator(schema).iter_errors(man))
    assert "not validated" in man["layers"][1]["name"]


def test_sync_refuses_wrong_grid_size(tmp_path):
    src, out = _setup(tmp_path)
    (out / "grid.json").write_text(json.dumps({"width": 5, "height": 3, "cell_m": 2.0}))
    try:
        sync(src, out)
    except SystemExit:
        return
    raise AssertionError("expected SystemExit")
