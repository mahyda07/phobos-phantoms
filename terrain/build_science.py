# Written with AI assistance (Claude).
"""Put Mahida's science inputs on the shared 2 m grid (PLAN.md D8, D19).  Track: terrain (Ramish, [P2]).

Reads  science/out/science-minerals-*-{CAR,CLAY,OLV}.tif  (CRISM browse-product layers, native ~18 m, own projection)
       science/stops.csv                                  (Mahida's stops, lat/lon; row/col empty)
Writes terrain/out/science.bin   float32 0..1, relative mineral signal (mean of carbonate, clay, olivine)
       terrain/out/science.png   preview (dark = low, yellow = high), north at the top
       terrain/out/stops.csv     same columns as science/stops.csv with row/col filled on our grid
       terrain/out/layers.manifest.json  (adds the science and stops entries)

Method (same scaling as science/code/make_stops.py, so the numbers agree with Mahida's):
  each CRISM layer is reprojected to our grid with NEAREST neighbour (no smoothing: the data is ~18 m),
  stretched to 0..1 between its 1st and 99th percentile inside the walking area, and the three are averaged.
  These are RELATIVE signals from browse products, not mineral amounts.
"""
import csv, json, pathlib, sys

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pipeline.frame import Frame  # noqa: E402

OUT = ROOT / "terrain/out"
NODATA = -9999.0
TAGS = {"carbonate": "CAR", "clay": "CLAY", "olivine": "OLV"}


def to_grid(path, grid):
    dst = np.full((grid["height"], grid["width"]), NODATA, dtype="float32")
    with rasterio.open(path) as src:
        reproject(rasterio.band(src, 1), dst, src_nodata=src.nodata if src.nodata is not None else NODATA,
                  dst_nodata=NODATA, dst_transform=from_origin(*grid["origin_eqc"], grid["cell_m"], grid["cell_m"]),
                  dst_crs=grid["projection_wkt"], resampling=Resampling.nearest)
    return dst


def main():
    grid = json.loads((OUT / "grid.json").read_text())
    F = Frame(grid)
    files = {k: next((ROOT / "science/out").glob(f"science-minerals-*-{t}.tif")) for k, t in TAGS.items()}
    raw = {k: to_grid(p, grid) for k, p in files.items()}
    valid = np.logical_and.reduce([a != NODATA for a in raw.values()])
    print(f"CRISM coverage of the walking area: {valid.mean():.1%}")
    scaled = {}
    for k, a in raw.items():
        lo, hi = np.percentile(a[valid], [1, 99])
        scaled[k] = np.where(valid, np.clip((a - lo) / (hi - lo), 0, 1) if hi > lo else 0.0, 0.0)
        print(f"  {k:9s} source {files[k].name}: p1 {lo:.3f} p99 {hi:.3f}")
    score = ((scaled["carbonate"] + scaled["clay"] + scaled["olivine"]) / 3).astype("<f4")
    score.tofile(OUT / "science.bin")
    from PIL import Image
    g = np.clip(score / max(float(score.max()), 1e-6), 0, 1)
    rgb = np.stack([g, g * 0.85, 0.25 * (1 - g)], -1)
    Image.fromarray((rgb * 255).astype(np.uint8)).save(OUT / "science.png")

    rows = list(csv.DictReader(open(ROOT / "science/stops.csv", newline="", encoding="utf-8")))
    cols = ["id", "name", "location_note", "lat", "lon_e", "row", "col", "reason", "science_value", "source"]
    with open(OUT / "stops.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for r in rows:
            x, y = F.lonlat_to_local(float(r["lon_e"]), float(r["lat"]))
            if not F.inside(x, y):
                print(f"WARNING stop {r['id']} is outside the walking area; skipped")
                continue
            rr, cc = F.local_to_grid(x, y)
            r["row"], r["col"] = min(int(rr), grid["height"] - 1), min(int(cc), grid["width"] - 1)
            w.writerow({c: r[c] for c in cols})
            print(f"  stop {r['id']}: row {r['row']} col {r['col']} | science here {score[r['row'], r['col']]:.2f} (Mahida: {r['science_value']})")

    man = json.loads((OUT / "layers.manifest.json").read_text())
    man["layers"] = [l for l in man["layers"] if l["id"] not in ("science", "stops")]
    man["layers"] += [
        {"id": "science", "name": "Science value (relative mineral signal)", "file": "science.bin", "kind": "raster",
         "units": "0-1 relative", "cell_m": grid["cell_m"],
         "source": "CRISM FRT000047A3 MTRDR browse products (carbonate, clay, olivine), ~18 m, nearest-neighbour to 2 m; relative signal, not amounts",
         "licence": "NASA PDS, public", "citation": "https://ode.rsl.wustl.edu/mars (product FRT000047A3)"},
        {"id": "stops", "name": "Science stops", "file": "stops.csv", "kind": "vector",
         "source": "Mahida, from CRISM FRT000047A3 (science/code/make_stops.py)", "licence": "NASA PDS, public",
         "citation": "science/stops.csv"},
    ]
    (OUT / "layers.manifest.json").write_text(json.dumps(man, indent=2))
    print(f"science.bin: mean {score.mean():.2f} max {score.max():.2f} | NaN: {bool(np.isnan(score).any())}")


if __name__ == "__main__":
    main()
