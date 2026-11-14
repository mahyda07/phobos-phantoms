# Written with AI assistance (Claude).
"""Make FAKE sample files in our real formats so every track can start before real data arrives.

Every value here is SYNTHETIC and marked SAMPLE. Nothing here is NASA data.
Run from the repo root:  uv run python samples/make_samples.py
Outputs go to samples/out/.
"""
import csv, json, math, pathlib, datetime
import numpy as np
from PIL import Image
from skimage.graph import route_through_array

OUT = pathlib.Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(7)

N, CELL = 256, 2.0                      # 256 x 256 cells, 2 m each (512 m square)
X0, Y0 = 4589000.0, 1094000.0           # SAMPLE origin (NW corner) inside the download box, projection metres
SLOPE_LIMIT = 20.0                      # SAMPLE assumption, degrees
EVA_LIMIT_MIN = 240.0                   # SAMPLE assumption, minutes

# ---- synthetic terrain: gentle tilt + hills + a crater + noise ----
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
dem = -2560.0 + 0.04 * xx * CELL
for cx, cy, h, r in [(60, 70, 18, 25), (190, 60, 12, 30), (150, 180, 22, 20)]:
    dem += h * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r ** 2))
d = np.hypot(xx - 110, yy - 140)
dem += -15 * np.exp(-(d / 18) ** 2) + 6 * np.exp(-((d - 24) / 5) ** 2)   # crater bowl + rim
dem += rng.normal(0, 0.15, dem.shape)
dem = dem.astype("<f4")

gy, gx = np.gradient(dem.astype(np.float64), CELL)
slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype("<f4")
pad = np.pad(dem, 1, mode="edge")
win = np.stack([pad[r:r + N, c:c + N] for r in range(3) for c in range(3)])
rough = (win.max(0) - win.min(0)).astype("<f4")                           # max-min in 3x3, metres
hazard = np.clip(0.6 * np.exp(-(d / 30) ** 2) + rng.uniform(0, 0.15, dem.shape), 0, 1).astype("<f4")
science = np.clip(np.exp(-(((xx - 200) ** 2 + (yy - 200) ** 2) / (2 * 25 ** 2))), 0, 1).astype("<f4")

def save(name, arr, lo=None, hi=None, cmap=None):
    arr.astype("<f4").tofile(OUT / f"{name}.bin")
    lo = float(arr.min()) if lo is None else lo
    hi = float(arr.max()) if hi is None else hi
    g = np.clip((arr - lo) / (hi - lo + 1e-9), 0, 1)
    rgb = (np.stack([g, g * 0.6, g * 0.4], -1) if cmap == "mars" else np.stack([g, g, g], -1)) * 255
    Image.fromarray(rgb.astype(np.uint8)).save(OUT / f"{name}.png")

save("dem", dem, cmap="mars"); save("photo", dem, cmap="mars")  # SAMPLE stand-in for the HiRISE photo
save("slope", slope, 0, 35); save("rough", rough)
save("hazard", hazard, 0, 1); save("science", science, 0, 1)
lod1 = dem.reshape(128, 2, 128, 2).mean((1, 3)).astype("<f4"); lod1.tofile(OUT / "dem_lod1.bin")

z_ref = float(np.round(dem.min(), 1))
grid = {
    "frame": "jezero-local-v1",
    "projection_wkt": "SAMPLE - real WKT comes from the USGS DTM (+proj=eqc +lat_ts=0 +lon_0=0 +R=3396190)",
    "origin_eqc": [X0, Y0],
    "box_eqc": {"xmin": X0, "ymin": Y0 - N * CELL, "xmax": X0 + N * CELL, "ymax": Y0},
    "cell_m": 2, "width": N, "height": N, "z_ref": z_ref, "nodata": None,
    "layers_dir": "samples/out", "source_dtm": "SAMPLE (synthetic)",
}
(OUT / "grid.json").write_text(json.dumps(grid, indent=2))
(OUT / "terrain.meta.json").write_text(json.dumps({
    "frame": "jezero-local-v1", "width": N, "height": N, "cell_m": CELL, "origin_eqc": [X0, Y0],
    "z_ref": z_ref, "z_min": float(dem.min()), "z_max": float(dem.max()), "nodata": None,
    "dtype": "float32-le", "file": "dem.bin",
    "lod": [{"level": 0, "width": N, "height": N, "cell_m": CELL, "file": "dem.bin"},
            {"level": 1, "width": 128, "height": 128, "cell_m": 4.0, "file": "dem_lod1.bin"}],
}, indent=2))
(OUT / "hazard.meta.json").write_text(json.dumps({
    "frame": "jezero-local-v1", "model": "SAMPLE", "version": "SAMPLE",
    "classes": ["smooth terrain", "crater floor"], "hazard_groups": {"smooth terrain": "low", "crater floor": "high"},
    "metrics": {"miou": 0.0}, "file": "hazard.bin", "cell_m": CELL,
}, indent=2))

# ---- stops.csv (columns from contracts/csv.md) ----
def rc_to_xy(r, c): return c * CELL, -r * CELL
def xy_to_latlon(x, y, R=3396190.0): return math.degrees((Y0 + y) / R), math.degrees((X0 + x) / R)
stops = [("S1", "Sample rim outcrop", 116, 160), ("S2", "Sample bright patch", 200, 200)]
with open(OUT / "stops.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["id", "name", "location_note", "lat", "lon_e", "row", "col", "reason", "science_value", "source"])
    for sid, name, r, c in stops:
        lat, lon = xy_to_latlon(*rc_to_xy(r, c))
        w.writerow([sid, name, "SAMPLE", round(lat, 6), round(lon, 6), r, c, "SAMPLE reason", round(float(science[r, c]), 2), "SAMPLE"])

# ---- conditions.csv ----
with open(OUT / "conditions.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["ltst_hour", "temp_c", "pressure_pa", "dust_tau", "radiation_uGy_per_day", "source", "estimate"])
    for h in range(24):
        w.writerow([h, round(-75 + 55 * max(0, math.sin(math.pi * (h - 6) / 12)), 1), round(720 + 20 * math.cos(math.pi * h / 12), 1),
                    0.5, 230, "SAMPLE", "yes"])

# ---- route.json: least-cost path start -> S1 -> S2 -> end on the sample cost ----
cost = 1 + 4 * (slope / SLOPE_LIMIT) ** 2 + 0.5 * rough + 2 * hazard - 0.3 * science
cost = np.where(slope > SLOPE_LIMIT, 1e6, np.maximum(cost, 0.05))
pts = [(240, 20)] + [(r, c) for _, _, r, c in stops] + [(20, 240)]
path = []
for a, b in zip(pts[:-1], pts[1:]):
    seg, _ = route_through_array(cost, a, b, fully_connected=True, geometric=True)
    path += seg if not path else seg[1:]

def tobler_kmh(s_deg): return 6 * math.exp(-3.5 * abs(math.tan(math.radians(s_deg)) + 0.05))
coords, t, tlist, slist, hlist, length = [], 0.0, [], [], [], 0.0
for i, (r, c) in enumerate(path):
    x, y = rc_to_xy(r, c)
    coords.append([x, y, round(float(dem[r, c]), 2)])
    if i:
        step = math.hypot(x - coords[i - 1][0], y - coords[i - 1][1]); length += step
        t += step / 1000 / tobler_kmh(float(slope[r, c])) * 60
    tlist.append(round(t, 3)); slist.append(round(float(slope[r, c]), 2)); hlist.append(round(float(hazard[r, c]), 3))
time_back = t                                    # SAMPLE: walk back assumed same time as walk out
margins = [round(EVA_LIMIT_MIN - (tv + time_back * (1 - tv / t)), 2) for tv in tlist]   # SAMPLE simplification
route = {
    "type": "Feature",
    "geometry": {"type": "LineString", "coordinates": coords},
    "properties": {
        "frame": "jezero-local-v1", "plan_id": "SAMPLE-0001",
        "created_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "length_m": round(length, 1), "time_out_min": round(t, 1), "time_back_min": round(time_back, 1),
        "margin_min": round(EVA_LIMIT_MIN - t - time_back, 1), "slope_max_deg": round(max(slist), 1),
        "cost_weights": {"w_s": 4, "w_r": 0.5, "w_h": 2, "w_sci": 0.3}, "model_version": "SAMPLE",
        "assumptions": ["SAMPLE: synthetic terrain", "SAMPLE: EVA limit 240 min", "SAMPLE: Tobler speed, no Mars/suit factor"],
        "stops": [{"id": sid, "name": name, "x": rc_to_xy(r, c)[0], "y": rc_to_xy(r, c)[1], "reason": "SAMPLE reason",
                   "science_value": round(float(science[r, c]), 2), "citation": "SAMPLE"} for sid, name, r, c in stops],
        "per_vertex": {"t_min": tlist, "margin_min": margins, "slope_deg": slist, "hazard": hlist},
    },
}
(OUT / "route.json").write_text(json.dumps(route))

# ---- window.json ----
sun = [round(max(-20.0, 75 * math.sin(math.pi * (h - 6) / 12)), 1) for h in range(24)]
temp = [round(-75 + 55 * max(0, math.sin(math.pi * (h - 6) / 12)), 1) for h in range(24)]
(OUT / "window.json").write_text(json.dumps({
    "frame": "jezero-local-v1", "sol": 0, "ls_deg": 0, "ltst_hours": list(range(24)), "sun_elev_deg": sun,
    "sun_az_deg": [round(90 + 15 * (h - 6), 1) % 360 for h in range(24)], "temp_c": temp,
    "pressure_pa": [round(720 + 20 * math.cos(math.pi * h / 12), 1) for h in range(24)],
    "eva_window": {"start_ltst": 10.0, "end_ltst": 15.0}, "one_way_light_time_min": 12.5,
    "notes": "SAMPLE values only. Real values will be MEDA climatology and Mars24, not a forecast.",
}, indent=2))
print(f"wrote {len(list(OUT.iterdir()))} files to {OUT}; route {len(coords)} vertices, {length:.0f} m, {t:.1f} min out")
