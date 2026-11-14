# This file was written with help from Claude (AI). See AI_USAGE.md.
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from pyproj import CRS, Transformer

BOX = (77.33, 18.40, 77.47, 18.52)
FOLDER = "science/raw/frt000047a3/"
OUT = "science/out/"
NODATA = -9999.0

LAYERS = {
    "CAR": ("frt000047a3_07_brcr2j_mtr3.img", [1, 2]),
    "CLAY": ("frt000047a3_07_brpfmj_mtr3.img", [1]),
    "OLV": ("frt000047a3_07_brmafj_mtr3.img", [1]),
}

for tag, (name, bands) in LAYERS.items():
    with rasterio.open(FOLDER + name) as src:
        crs = CRS.from_wkt(src.crs.to_wkt())
        to_xy = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        x0, y0 = to_xy.transform(BOX[0], BOX[3])
        x1, y1 = to_xy.transform(BOX[2], BOX[1])
        b = src.bounds
        win = from_bounds(max(b.left, x0), max(b.bottom, y1), min(b.right, x1), min(b.top, y0), src.transform)
        win = win.round_offsets().round_lengths()
        layers = [src.read(i, window=win, masked=True).astype("float32") / 254.0 for i in bands]
        stack = np.ma.stack(layers)
        best = stack.max(axis=0)
        out = np.ma.filled(best, NODATA).astype("float32")
        profile = {
            "driver": "GTiff", "height": out.shape[0], "width": out.shape[1], "count": 1,
            "dtype": "float32", "crs": src.crs, "transform": src.window_transform(win),
            "nodata": NODATA, "compress": "lzw",
        }
        path = OUT + "science-minerals-FRT000047A3-" + tag + ".tif"
        with rasterio.open(path, "w", **profile) as dst:
            dst.write(out, 1)
        good = out[out != NODATA]
        print(path, out.shape, "valid", good.size, "max", round(float(good.max()), 3), "mean", round(float(good.mean()), 4))
