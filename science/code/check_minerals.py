# This file was written with help from Claude (AI). See AI_USAGE.md.
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from pyproj import CRS, Transformer

BOX = (77.33, 18.40, 77.47, 18.52)
FOLDER = "science/raw/frt000047a3/"
FILES = [
    "frt000047a3_07_brcr2j_mtr3.img",
    "frt000047a3_07_brpfmj_mtr3.img",
    "frt000047a3_07_brmafj_mtr3.img",
]

for name in FILES:
    with rasterio.open(FOLDER + name) as src:
        print(name)
        print("  size", src.width, "x", src.height, "bands", src.count, "type", src.dtypes[0], "nodata", src.nodata)
        crs = CRS.from_wkt(src.crs.to_wkt())
        to_xy = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        x0, y0 = to_xy.transform(BOX[0], BOX[3])
        x1, y1 = to_xy.transform(BOX[2], BOX[1])
        b = src.bounds
        left, right = max(b.left, x0), min(b.right, x1)
        bottom, top = max(b.bottom, y1), min(b.top, y0)
        if left >= right or bottom >= top:
            print("  NO overlap with the box")
            continue
        print("  box covered: %.0f%% across, %.0f%% up-down" % (100 * (right - left) / (x1 - x0), 100 * (top - bottom) / (y0 - y1)))
        win = from_bounds(left, bottom, right, top, src.transform).round_offsets().round_lengths()
        for i in range(1, src.count + 1):
            data = src.read(i, window=win, masked=True).compressed()
            if data.size == 0:
                print("  band", i, src.descriptions[i - 1], ": no valid pixels")
            else:
                print("  band", i, src.descriptions[i - 1], ": valid", data.size, "min", data.min(), "max", data.max(), "mean", round(float(data.mean()), 1))
