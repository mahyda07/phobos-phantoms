# This file was written with help from Claude (AI). See AI_USAGE.md.
import csv
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from pyproj import CRS, Transformer
from scipy.ndimage import uniform_filter

WEST, SOUTH, EAST, NORTH = 77.39748, 18.44724, 77.42279, 18.47254
NODATA = -9999.0
FILES = {
    "carbonate": "science/out/science-minerals-FRT000047A3-CAR.tif",
    "clay": "science/out/science-minerals-FRT000047A3-CLAY.tif",
    "olivine": "science/out/science-minerals-FRT000047A3-OLV.tif",
}
SOURCE = "CRISM FRT000047A3 MTRDR browse products, MRO, NASA PDS via ODE https://ode.rsl.wustl.edu/mars"

raw = {}
for name, path in FILES.items():
    with rasterio.open(path) as src:
        crs = CRS.from_wkt(src.crs.to_wkt())
        to_xy = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        x0, y0 = to_xy.transform(WEST, NORTH)
        x1, y1 = to_xy.transform(EAST, SOUTH)
        win = from_bounds(x0, y1, x1, y0, src.transform).round_offsets().round_lengths()
        raw[name] = src.read(1, window=win, boundless=True, fill_value=NODATA)
        tr = src.window_transform(win)

valid = np.ones(raw["carbonate"].shape, dtype=bool)
for a in raw.values():
    valid &= a != NODATA
print("Walking area valid data: %.0f%%" % (100 * valid.mean()))
if valid.sum() < 100:
    raise SystemExit("Too little data in the walking area. Need another CRISM product.")

scaled = {}
for name, a in raw.items():
    v = a[valid]
    lo, hi = np.percentile(v, 1), np.percentile(v, 99)
    if hi <= lo:
        hi = v.max()
    s = np.clip((a - lo) / (hi - lo), 0, 1) if hi > lo else np.zeros_like(a)
    scaled[name] = np.where(valid, s, 0.0)

score = (scaled["carbonate"] + scaled["clay"] + scaled["olivine"]) / 3
smooth = uniform_filter(score, 3)
cell = abs(tr.a)

stops = []
for sep_m in (300, 200, 120):
    sep = int(round(sep_m / cell))
    work = np.where(valid, smooth, -1.0)
    work[:3, :] = -1.0
    work[-3:, :] = -1.0
    work[:, :3] = -1.0
    work[:, -3:] = -1.0
    stops = []
    while len(stops) < 5:
        r, c = divmod(int(np.argmax(work)), work.shape[1])
        if work[r, c] < 0:
            break
        stops.append((r, c))
        work[max(0, r - sep): r + sep + 1, max(0, c - sep): c + sep + 1] = -1.0
    if len(stops) >= 4:
        break

to_geo = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
cr, cc = scaled["carbonate"].shape[0] / 2, scaled["carbonate"].shape[1] / 2
dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
rows = []
for i, (r, c) in enumerate(stops, 1):
    x, y = tr * (c + 0.5, r + 0.5)
    lon, lat = to_geo.transform(x, y)
    vals = {k: float(scaled[k][r, c]) for k in scaled}
    top = max(vals, key=vals.get)
    dx, dy = (c - cc) * cell, (cr - r) * cell
    dist = int(round(float(np.hypot(dx, dy)), -1))
    ang = (np.degrees(np.arctan2(dx, dy)) + 360) % 360
    where = "near the centre of the area" if dist < 50 else "about %d m %s of the area centre" % (dist, dirs[int(((ang + 22.5) % 360) // 45)])
    reason = "Strong combined CRISM mineral signal here, mostly %s (carbonate %.2f, clay %.2f, olivine index %.2f on a 0 to 1 scale)." % (top, vals["carbonate"], vals["clay"], vals["olivine"])
    rows.append([ "S%d" % i, "%s-signal spot %d" % (top, i), where, round(lat, 6), round(lon, 6), "", "", reason, round(float(smooth[r, c]), 3), SOURCE])

with open("science/stops.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "name", "location_note", "lat", "lon_e", "row", "col", "reason", "science_value", "source"])
    w.writerows(rows)

for r in rows:
    print(r[0], r[1], "|", r[2], "|", r[3], r[4], "| value", r[8])
