# Written with AI assistance (Claude).
"""Put Maryam's AI hazard layer next to the other terrain layers (PLAN.md D28).  Track: terrain (Ramish, [P2]).

Reads  model/out/hazard.bin, hazard.png, hazard.meta.json, hazard_classes.bin   (Maryam, model/ track)
Writes terrain/out/ copies of the same files (byte-for-byte)
       terrain/out/layers.manifest.json  (adds or replaces the "hazard" entry)

Why a copy: the web map (display/scripts/copy-data.mjs) and the stand-in planner read terrain/out/ only.
The model/ files stay the source of truth; re-run this after Maryam regenerates them:
    uv run python terrain/sync_hazard.py
"""
import json, pathlib, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "model/out"
OUT = ROOT / "terrain/out"
FILES = ["hazard.bin", "hazard.png", "hazard.meta.json", "hazard_classes.bin"]


def hazard_entry(meta, grid):
    m = meta["metrics"]
    return {
        "id": "hazard", "name": "AI hazard estimate (model, not validated)", "file": meta["file"], "kind": "raster",
        "units": "0-1 relative", "cell_m": grid["cell_m"],
        "source": (f"{meta['model']}; {meta['version']}; held-out test mIoU {m['miou']:.3f} "
                   f"(baselines {m['baseline_majority_miou']:.3f} / {m['baseline_photo_stats_miou']:.3f}); "
                   "see model/MODEL_CARD.md"),
        "licence": "Derived from USGS HiRISE orthomosaic + DTM (U.S. Government work, public domain); model by the team",
        "citation": "model/MODEL_CARD.md",
        "colormap": "0-1 green-amber-red",
    }


def sync(src=SRC, out=OUT):
    meta = json.loads((src / "hazard.meta.json").read_text())
    grid = json.loads((out / "grid.json").read_text())
    n = grid["width"] * grid["height"]
    size = (src / meta["file"]).stat().st_size
    if size != 4 * n or meta["width"] != grid["width"] or meta["height"] != grid["height"]:
        sys.exit(f"hazard grid {meta['width']}x{meta['height']} ({size} bytes) does not match terrain grid {grid['width']}x{grid['height']}")
    for f in FILES:
        if (src / f).exists():
            shutil.copyfile(src / f, out / f)
            print(f"copied model/out/{f} -> terrain/out/{f}")
    man = json.loads((out / "layers.manifest.json").read_text())
    man["layers"] = [l for l in man["layers"] if l["id"] != "hazard"] + [hazard_entry(meta, grid)]
    (out / "layers.manifest.json").write_text(json.dumps(man, indent=2))
    print("layers.manifest.json: hazard entry written")


if __name__ == "__main__":
    sync()
