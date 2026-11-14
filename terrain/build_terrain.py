# Written with AI assistance (Claude).
"""Build the real terrain layers for the walking area (PLAN.md D16, D19).  Track: terrain (Ramish, [P2]).

Reads:
  --dtm    USGS Mars 2020 TRN HiRISE DTM mosaic, 1 m (local copy; default F:/SpaceApps2026/data/terrain/JEZ_TRN_DTM_1m.tif)
  --ortho  USGS Mars 2020 TRN HiRISE orthomosaic, 25 cm (default: streamed from USGS; only the walking area is read)
  --rover  folder with NASA M20_traverse.json and M20_waypoints.json
Writes to terrain/out/ (all .bin = float32 little-endian, row-major from the NW corner, 750 x 750 cells of 2 m):
  grid.json, terrain.meta.json, layers.manifest.json, dem.bin, dem_lod512.bin, dem_lod256.bin, slope.bin, rough.bin,
  photo.png, photo_2k.jpg, dem.png, slope.png, rough.png, rover_path.json, rover_waypoints.csv
Writes to --big (outside git): photo_25cm.tif (full-resolution photo crop for the AI hazard model), dem_2m.tif.

Method (written down so the numbers are reproducible):
  dem   = mean of the 2 x 2 one-metre DTM cells in each 2 m cell (exact pixel alignment, no shift)
  slope = Horn (1981) 3 x 3 method on the 2 m DEM, degrees (same as `gdaldem slope`)
  rough = largest elevation difference in the 3 x 3 window around each 2 m cell, metres (same as `gdaldem roughness`)
  small holes (no-data) are filled from neighbours; the count is recorded in terrain.meta.json
"""
import argparse, csv, json, math, pathlib, sys, time

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.fill import fillnodata
from rasterio.windows import from_bounds
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pipeline.frame import Frame  # noqa: E402  (shared coordinate helpers, PLAN.md D20)

BOX = {"xmin": 4587712.0, "ymin": 1093454.0, "xmax": 4589212.0, "ymax": 1094954.0}   # PLAN.md D16
CELL = 2.0
ORTHO_URL = ("/vsicurl/https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/"
             "JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif")
DTM_DOI = "https://doi.org/10.5066/P9REJ9JN"
ORTHO_DOI = "https://doi.org/10.5066/P9QJDP48"
# Big HTTP chunks: the USGS files store one image row per block, so tiny reads are very slow.
HTTP_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                CPL_VSIL_CURL_CHUNK_SIZE=str(10 * 1024 * 1024), GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
                GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="3")


def log(msg): print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def write_bin(path, arr): np.ascontiguousarray(arr, dtype="<f4").tofile(path)


def png(path, arr, lo, hi, cmap=None):
    g = np.clip((np.nan_to_num(arr, nan=lo) - lo) / (hi - lo), 0, 1)
    if cmap == "slope":      # green -> yellow -> red
        rgb = np.stack([np.clip(2 * g, 0, 1), np.clip(2 - 2 * g, 0, 1), np.zeros_like(g)], -1)
    elif cmap == "mars":
        rgb = np.stack([g, 0.55 * g + 0.1, 0.35 * g + 0.05], -1)
    else:
        rgb = np.stack([g, g, g], -1)
    Image.fromarray((rgb * 255).astype(np.uint8)).save(path)


def horn_slope(z, cell):
    p = np.pad(z, 1, mode="edge")
    a, b, c = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    d, f = p[1:-1, :-2], p[1:-1, 2:]
    g, h, i = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cell)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cell)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy)))


def roughness(z):
    p = np.pad(z, 1, mode="edge")
    win = np.stack([p[r:r + z.shape[0], c:c + z.shape[1]] for r in range(3) for c in range(3)])
    return win.max(0) - win.min(0)


def lod(z, n):
    from skimage.transform import resize
    return resize(z, (n, n), order=1, anti_aliasing=True, preserve_range=True).astype("<f4")


def build_dtm(dtm_path):
    with rasterio.open(dtm_path) as ds:
        assert abs(ds.res[0] - 1.0) < 1e-9 and abs(ds.res[1] - 1.0) < 1e-9, f"expected 1 m DTM, got {ds.res}"
        win = from_bounds(BOX["xmin"], BOX["ymin"], BOX["xmax"], BOX["ymax"], ds.transform)
        assert abs(win.col_off - round(win.col_off)) < 1e-6 and abs(win.row_off - round(win.row_off)) < 1e-6, \
            "box is not on whole DTM pixels"
        win = win.round_offsets().round_lengths()
        z1 = ds.read(1, window=win, masked=True).astype("float64")
        wkt, nodata = ds.crs.to_wkt(), ds.nodata
        log(f"DTM window {z1.shape} read; no-data cells (1 m): {int(np.ma.getmaskarray(z1).sum())}")
    holes_1m = int(np.ma.getmaskarray(z1).sum())
    if holes_1m:
        filled = fillnodata(z1.filled(0).astype("float32"), mask=(~np.ma.getmaskarray(z1)).astype("uint8"),
                            max_search_distance=20)
        z1 = np.ma.masked_array(filled, mask=False)
    z1 = np.asarray(z1, dtype="float64")
    n = int(round((BOX["xmax"] - BOX["xmin"]) / CELL))
    z2 = z1.reshape(n, 2, n, 2).mean(axis=(1, 3))
    return z2, wkt, nodata, holes_1m


def build_photo(ortho_src, big_dir, n):
    local = big_dir / "photo_25cm.tif"
    if ortho_src == ORTHO_URL and local.exists():
        log(f"photo: using the copy already on disk ({local}) instead of downloading again")
        ortho_src = str(local)
    env = HTTP_ENV if ortho_src.startswith("/vsicurl/") else {}
    with rasterio.Env(**env), rasterio.open(ortho_src) as ds:
        win = from_bounds(BOX["xmin"], BOX["ymin"], BOX["xmax"], BOX["ymax"], ds.transform).round_offsets().round_lengths()
        log(f"photo: reading {int(win.width)} x {int(win.height)} px at {ds.res[0]} m (this is the slow step)...")
        t = time.time()
        img = ds.read(1, window=win)
        log(f"photo read in {time.time() - t:.0f} s")
        prof = ds.profile.copy()
        prof.update(driver="GTiff", width=img.shape[1], height=img.shape[0], transform=ds.window_transform(win),
                    compress="deflate", tiled=True, blockxsize=256, blockysize=256)
    big_dir.mkdir(parents=True, exist_ok=True)
    if pathlib.Path(ortho_src).resolve() != local.resolve():
        with rasterio.open(local, "w", **prof) as dst:
            dst.write(img, 1)
    # 2048 x 2048 headset texture (sharper than the 750 px map image), same contrast stretch, north at the top
    valid = img[img > 0]
    lo2, hi2 = np.percentile(valid, [1, 99]) if valid.size else (0, 255)
    g = np.clip((img.astype("float32") - lo2) / (hi2 - lo2), 0, 1) * 255
    Image.fromarray(g.astype(np.uint8)).resize((2048, 2048), Image.LANCZOS).save(
        ROOT / "terrain/out/photo_2k.jpg", quality=88)
    f = img.shape[0] // n
    small = img[: n * f, : n * f].reshape(n, f, n, f).astype("float32").mean(axis=(1, 3))
    lo, hi = np.percentile(small[small > 0], [1, 99]) if (small > 0).any() else (0, 255)
    png(ROOT / "terrain/out/photo.png", small, lo, hi)
    return img.shape, float(abs(prof["transform"].a))


def build_rover(rover_dir, F):
    trav = json.loads((rover_dir / "M20_traverse.json").read_text())
    feats, total = [], 0.0
    for ft in trav["features"]:
        pts = [F.lonlat_to_local(c[0], c[1]) for c in ft["geometry"]["coordinates"]]
        run = []
        for pt in pts + [None]:
            if pt is not None and F.inside(*pt):
                run.append([round(pt[0], 2), round(pt[1], 2)])
                continue
            if len(run) >= 2:
                L = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(run, run[1:]))
                total += L
                feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": run},
                              "properties": {"sol": ft["properties"].get("sol"), "length_m": round(L, 1)}})
            run = []
    out = {"type": "FeatureCollection", "frame": "jezero-local-v1",
           "source": "NASA/JPL-Caltech M20_traverse.json (https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json)",
           "note": "Perseverance's real path clipped to the walking area; coordinates are local metres [x, y]",
           "total_length_m": round(total, 1), "features": feats}
    (ROOT / "terrain/out/rover_path.json").write_text(json.dumps(out))
    wps = json.loads((rover_dir / "M20_waypoints.json").read_text())["features"]
    rows = []
    for w in wps:
        p = w["properties"]
        x, y = F.lonlat_to_local(p["lon"], p["lat"])
        if F.inside(x, y):
            r, c = F.local_to_grid(x, y)
            rows.append([p.get("sol"), p.get("site"), p.get("drive"), round(x, 2), round(y, 2), int(r), int(c),
                         p.get("tilt"), p.get("pitch"), p.get("roll"), p.get("elev_geoid")])
    with open(ROOT / "terrain/out/rover_waypoints.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["sol", "site", "drive", "x", "y", "row", "col", "tilt_deg", "pitch_deg", "roll_deg", "elev_geoid_m"])
        wr.writerows(rows)
    return total, len(feats), len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dtm", default="F:/SpaceApps2026/data/terrain/JEZ_TRN_DTM_1m.tif")
    ap.add_argument("--ortho", default=ORTHO_URL)
    ap.add_argument("--rover", default="F:/SpaceApps2026/data/rover")
    ap.add_argument("--big", default="F:/SpaceApps2026/data/terrain", help="folder for big files kept out of git")
    ap.add_argument("--skip-photo", action="store_true")
    a = ap.parse_args()
    out = ROOT / "terrain/out"; out.mkdir(parents=True, exist_ok=True)
    big = pathlib.Path(a.big)

    log("1/5 DTM -> 2 m grid")
    z, wkt, src_nodata, holes = build_dtm(a.dtm)
    n = z.shape[0]
    z_ref = float(math.floor(np.nanmin(z)))
    grid = {"frame": "jezero-local-v1", "projection_wkt": wkt, "origin_eqc": [BOX["xmin"], BOX["ymax"]],
            "box_eqc": BOX, "box_latlon": {}, "cell_m": 2, "width": n, "height": n, "z_ref": z_ref,
            "nodata": None, "layers_dir": "terrain/out", "source_dtm": DTM_DOI}
    F = Frame(grid)
    lon0, lat0 = F.local_to_lonlat(0, 0); lon1, lat1 = F.local_to_lonlat(n * CELL, -n * CELL)
    grid["box_latlon"] = {"lat_min": round(lat1, 6), "lat_max": round(lat0, 6), "lon_min_e": round(lon0, 6), "lon_max_e": round(lon1, 6)}

    log("2/5 slope, roughness, LODs, previews")
    slope, rough = horn_slope(z, CELL), roughness(z)
    write_bin(out / "dem.bin", z); write_bin(out / "slope.bin", slope); write_bin(out / "rough.bin", rough)
    write_bin(out / "dem_lod512.bin", lod(z, 512)); write_bin(out / "dem_lod256.bin", lod(z, 256))
    png(out / "dem.png", z, np.nanmin(z), np.nanmax(z), "mars")
    png(out / "slope.png", slope, 0, 35, "slope")
    png(out / "rough.png", rough, 0, float(np.percentile(rough, 99)))
    with rasterio.open(big / "dem_2m.tif", "w", driver="GTiff", width=n, height=n, count=1, dtype="float32",
                       crs=wkt, transform=rasterio.transform.from_origin(BOX["xmin"], BOX["ymax"], CELL, CELL),
                       compress="deflate") as dst:
        dst.write(z.astype("float32"), 1)

    (out / "grid.json").write_text(json.dumps(grid, indent=2))
    meta = {"frame": "jezero-local-v1", "width": n, "height": n, "cell_m": CELL, "origin_eqc": grid["origin_eqc"],
            "z_ref": z_ref, "z_min": float(np.nanmin(z)), "z_max": float(np.nanmax(z)), "nodata": None,
            "dtype": "float32-le", "file": "dem.bin",
            "lod": [{"level": 0, "width": n, "height": n, "cell_m": CELL, "file": "dem.bin"},
                    {"level": 1, "width": 512, "height": 512, "cell_m": n * CELL / 512, "file": "dem_lod512.bin"},
                    {"level": 2, "width": 256, "height": 256, "cell_m": n * CELL / 256, "file": "dem_lod256.bin"}]}
    (out / "terrain.meta.json").write_text(json.dumps(meta, indent=2))

    log("3/5 rover path on the grid")
    total, nseg, nwp = build_rover(pathlib.Path(a.rover), F)

    photo_info = "skipped"
    if not a.skip_photo:
        log("4/5 photo (HiRISE orthomosaic) for the walking area")
        shape, res = build_photo(a.ortho, big, n)
        photo_info = f"{shape[1]} x {shape[0]} px at {res} m -> photo.png {n} x {n}; full-res copy in {big / 'photo_25cm.tif'}"

    log("5/5 layers.manifest.json")
    lic = "USGS data release (U.S. Government work, public domain) — confirm on the DOI page"
    layers = [
        {"id": "dem", "name": "Elevation", "file": "dem.bin", "kind": "raster", "units": "m", "cell_m": CELL,
         "source": "USGS Mars 2020 TRN HiRISE DTM mosaic, 1 m, averaged to 2 m", "licence": lic, "citation": DTM_DOI},
        {"id": "slope", "name": "Slope", "file": "slope.bin", "kind": "raster", "units": "deg", "cell_m": CELL,
         "source": "Horn (1981) slope from the 2 m DEM", "licence": lic, "citation": DTM_DOI, "colormap": "0-35 deg green-red"},
        {"id": "rough", "name": "Roughness", "file": "rough.bin", "kind": "raster", "units": "m", "cell_m": CELL,
         "source": "Max elevation difference in 3x3 window of the 2 m DEM", "licence": lic, "citation": DTM_DOI},
        {"id": "photo", "name": "HiRISE photo", "file": "photo.png", "kind": "texture", "cell_m": CELL,
         "source": "USGS Mars 2020 TRN HiRISE orthomosaic, 25 cm, averaged to 2 m", "licence": lic, "citation": ORTHO_DOI},
        {"id": "photo_2k", "name": "HiRISE photo, headset texture", "file": "photo_2k.jpg", "kind": "texture",
         "cell_m": round(n * CELL / 2048, 4), "source": "USGS Mars 2020 TRN HiRISE orthomosaic, 25 cm, resized to 2048 px",
         "licence": lic, "citation": ORTHO_DOI},
        {"id": "rover", "name": "Perseverance path", "file": "rover_path.json", "kind": "vector",
         "source": "NASA/JPL-Caltech Where is Perseverance? (M20_traverse.json)", "licence": "NASA data, public",
         "citation": "https://science.nasa.gov/mission/mars-2020-perseverance/location-map/"},
    ]
    (out / "layers.manifest.json").write_text(json.dumps({"frame": "jezero-local-v1", "layers": layers}, indent=2))

    print("\n=== SUMMARY ===")
    print(f"grid: {n} x {n} cells of {CELL} m | origin_eqc {grid['origin_eqc']} | z_ref {z_ref}")
    print(f"corners: NW {lat0:.5f}N {lon0:.5f}E | SE {lat1:.5f}N {lon1:.5f}E")
    print(f"elevation m: min {np.nanmin(z):.1f} max {np.nanmax(z):.1f} | DTM holes filled (1 m cells): {holes}")
    print(f"slope deg: median {np.median(slope):.1f} p95 {np.percentile(slope, 95):.1f} max {slope.max():.1f} | "
          f"cells over 15 deg: {(slope > 15).mean():.1%}, over 25 deg: {(slope > 25).mean():.1%}")
    print(f"rough m: median {np.median(rough):.2f} p95 {np.percentile(rough, 95):.2f} max {rough.max():.2f}")
    print(f"NaN anywhere: {bool(np.isnan(z).any() or np.isnan(slope).any() or np.isnan(rough).any())}")
    print(f"rover path: {total / 1000:.2f} km in {nseg} pieces | waypoints in area: {nwp}")
    print(f"photo: {photo_info}")


if __name__ == "__main__":
    main()
