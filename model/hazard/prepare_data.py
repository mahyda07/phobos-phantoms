# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Data preparation for the AI hazard model. Run from the repo root, one step at a time:

  uv run python model/hazard/prepare_data.py download   # photo band from USGS (resumable) + integrity checks
  uv run python model/hazard/prepare_data.py labels     # hazard classes from the 1 m DTM for the same band
  uv run python model/hazard/prepare_data.py split      # spatial blocks -> train / validation / test, tile list

Nothing here reads the walking area for training: its block is excluded in `split` (see MODEL_CARD.md).
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))   # lets the scripts import each other when run by path
import concurrent.futures, json, sys, time

import numpy as np

from common import AI, CFG, DATA, ORTHO_H, ORTHO_W, PX, X0, Y_TOP, band_dtm_rows, dtm_col, dtm_row, sha256


def log(msg): print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ------------------------------------------------------------------ download
def download():
    """Copy the rows of the USGS orthomosaic that cover the training band into AI/ortho_band.npy (uint8).

    The USGS file is an uncompressed GeoTIFF with one image row per strip, so a row range is one byte range.
    We read the strip offsets from the file itself, check they are contiguous, and fetch with HTTP Range requests.
    """
    import rasterio, requests
    url = CFG["ortho_url"]
    r0, r1 = band_dtm_rows()
    p0, p1 = r0 * PX, r1 * PX                      # photo rows [p0, p1)
    n_rows = p1 - p0
    AI.mkdir(parents=True, exist_ok=True)
    out, state_path = AI / "ortho_band.npy", AI / "ortho_band.state.json"
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
               GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="3")
    with rasterio.Env(**env), rasterio.open("/vsicurl/" + url) as ds:
        assert (ds.width, ds.height) == (ORTHO_W, ORTHO_H) and ds.dtypes[0] == "uint8", (ds.width, ds.height, ds.dtypes)
        assert abs(ds.transform.c - X0) < 1e-6 and abs(ds.transform.f - Y_TOP) < 1e-6 and abs(ds.res[0] - 0.25) < 1e-9
        assert ds.compression is None and ds.block_shapes[0] == (1, ORTHO_W), (ds.compression, ds.block_shapes)
        off = lambda row: int(ds.get_tag_item(f"BLOCK_OFFSET_0_{row}", "TIFF", bidx=1))
        size = lambda row: int(ds.get_tag_item(f"BLOCK_SIZE_0_{row}", "TIFF", bidx=1))
        first = off(p0)
        for row in (p0, p0 + 1, p0 + n_rows // 3, p0 + n_rows // 2, p1 - 1):
            assert size(row) == ORTHO_W and off(row) == first + (row - p0) * ORTHO_W, f"strips not contiguous at row {row}"
    head = requests.head(url, allow_redirects=True, timeout=60)
    src = {"url": url, "content_length": head.headers.get("Content-Length"), "etag": head.headers.get("ETag"),
           "last_modified": head.headers.get("Last-Modified")}
    log(f"band photo rows {p0}..{p1} ({n_rows} rows x {ORTHO_W} px = {n_rows * ORTHO_W / 1e9:.2f} GB), first byte {first}")
    state = json.loads(state_path.read_text()) if state_path.exists() else {"done": []}
    if out.exists() and state.get("shape") == [n_rows, ORTHO_W]:
        arr = np.lib.format.open_memmap(out, mode="r+")
    else:
        arr = np.lib.format.open_memmap(out, mode="w+", dtype=np.uint8, shape=(n_rows, ORTHO_W))
        state = {"done": [], "shape": [n_rows, ORTHO_W]}
    chunk_rows = 200                                 # 17 MB per request
    chunks = [(a, min(a + chunk_rows, n_rows)) for a in range(0, n_rows, chunk_rows)]
    todo = [c for c in chunks if c[0] not in set(state["done"])]
    log(f"{len(chunks) - len(todo)} of {len(chunks)} chunks already on disk; fetching {len(todo)}")

    def fetch(c):
        a, b = c
        lo, hi = first + a * ORTHO_W, first + b * ORTHO_W - 1
        for attempt in range(8):
            try:
                r = requests.get(url, headers={"Range": f"bytes={lo}-{hi}"}, timeout=180)
                if r.status_code == 206 and len(r.content) == (b - a) * ORTHO_W:
                    arr[a:b] = np.frombuffer(r.content, np.uint8).reshape(b - a, ORTHO_W)
                    return a
                err = f"status {r.status_code}, {len(r.content)} bytes"
            except Exception as e:                  # network hiccup: wait and retry
                err = repr(e)
            time.sleep(3 + 3 * attempt)
        raise RuntimeError(f"chunk {c} failed: {err}")

    t0, got = time.time(), 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        for a in ex.map(fetch, todo):
            state["done"].append(a); got += 1
            if got % 10 == 0 or got == len(todo):
                arr.flush(); state_path.write_text(json.dumps(state))
                mb = got * chunk_rows * ORTHO_W / 1e6
                log(f"{got}/{len(todo)} chunks, {mb / (time.time() - t0):.2f} MB/s")
    arr.flush(); del arr
    state_path.write_text(json.dumps(state))
    # --- checks: the walking-area window must equal the photo crop the terrain track already has, pixel for pixel
    arr = np.load(out, mmap_mode="r")
    wb = CFG["walk_box"]
    wr0, wc0 = (dtm_row(wb["ymax"]) - r0) * PX, dtm_col(wb["xmin"]) * PX
    n = int(round((wb["xmax"] - wb["xmin"]) * PX))
    with rasterio.open(DATA / CFG["walk_photo_file"]) as ds:
        ref = ds.read(1)
    same = bool(np.array_equal(np.asarray(arr[wr0:wr0 + n, wc0:wc0 + n]), ref))
    digest = sha256(out)
    info = {"file": str(out), "shape": [n_rows, ORTHO_W], "dtype": "uint8", "photo_rows": [p0, p1], "source": src,
            "sha256_npy": digest, "walk_window_equals_photo_25cm_tif": same,
            "nodata_share": float((np.asarray(arr[::40, ::40]) == 0).mean()),
            "created": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    (AI / "ortho_band.info.json").write_text(json.dumps(info, indent=1))
    log(json.dumps(info, indent=1))
    assert same, "registration check failed: band does not match photo_25cm.tif on the walking area"


# ------------------------------------------------------------------ labels
def horn_slope(z, cell):
    """Horn (1981) 3 x 3 slope in degrees, same formula as terrain/build_terrain.py."""
    p = np.pad(z, 1, mode="edge")
    a, b, c = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    d, f = p[1:-1, :-2], p[1:-1, 2:]
    g, h, i = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cell)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cell)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy))).astype(np.float32)


def terrain_fields(z1, valid1, window_m):
    """From a 1 m DTM block return (slope_deg, rough_m, valid) on 2 m cells.

    slope  : Horn 3 x 3 on the 2 m DEM (mean of 2 x 2 one-metre cells), identical to terrain/out/slope.bin
    rough  : DETRENDED roughness. residual = elevation minus its mean in a window_m x window_m window (this removes
             the local slope: on a tilted plane the residual is zero); roughness = max - min of the residual in the
             same window (1 m cells), then the larger value of the 2 x 2 cells in each 2 m cell.
    valid  : False where the DTM has no data within the windows used.
    """
    from scipy import ndimage as ndi
    z1 = np.where(valid1, z1, np.nan).astype(np.float32)
    fill = np.where(valid1, z1, np.float32(np.nanmean(z1)))
    h, w = (z1.shape[0] // 2) * 2, (z1.shape[1] // 2) * 2
    z2 = fill[:h, :w].reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3))
    slope = horn_slope(z2, 2.0)
    resid = fill - ndi.uniform_filter(fill, size=window_m, mode="nearest")
    rough1 = ndi.maximum_filter(resid, size=window_m, mode="nearest") - ndi.minimum_filter(resid, size=window_m, mode="nearest")
    rough = rough1[:h, :w].reshape(h // 2, 2, w // 2, 2).max(axis=(1, 3)).astype(np.float32)
    bad1 = ndi.binary_dilation(~valid1, iterations=window_m + 2)
    valid = ~bad1[:h, :w].reshape(h // 2, 2, w // 2, 2).any(axis=(1, 3))
    return slope, rough, valid


def ramp(v, lo, hi):
    """1 at or below lo, 0 at or above hi, straight line between (the ramp used in Maryam's score.py)."""
    return np.clip((hi - v) / (hi - lo), 0.0, 1.0)


def classes_from_fields(slope, rough, valid, L=None):
    """Class per 2 m cell: 0 go, 1 careful, 2 avoid, 255 no data (rules: config.json 'labels', from Maryam's score.py)."""
    L = L or CFG["labels"]
    score = np.minimum(ramp(slope, *L["slope_ramp_deg"]), ramp(rough, *L["rough_ramp_m"]))
    cls = np.full(slope.shape, 1, np.uint8)                 # careful
    cls[score >= L["go"]] = 0                               # go
    cls[score < L["careful"]] = 2                           # avoid
    cls[~valid] = L["ignore_index"]
    return cls


def read_band_dtm():
    import rasterio
    from rasterio.windows import Window
    r0, r1 = band_dtm_rows()
    with rasterio.open(DATA / CFG["dtm_file"]) as ds:
        assert (ds.width, ds.height) == (ORTHO_W // PX, ORTHO_H // PX) and abs(ds.transform.c - X0) < 1e-6 and abs(ds.transform.f - Y_TOP) < 1e-6
        z = ds.read(1, window=Window(0, r0, ds.width, r1 - r0))
        nodata = ds.nodata
    valid = np.isfinite(z) & (z > -1e30) if nodata is not None else np.isfinite(z)
    return z, valid


def photo_valid_2m(band):
    """True for 2 m cells whose 8 x 8 photo pixels all hold data (the mosaic uses 0 for no data)."""
    n_rows, n_cols = band.shape[0] // 8, band.shape[1] // 8
    out = np.zeros((n_rows, n_cols), bool)
    step = 400                                              # 2 m rows per chunk
    for a in range(0, n_rows, step):
        b = min(a + step, n_rows)
        blk = np.asarray(band[a * 8:b * 8, :n_cols * 8])
        out[a:b] = blk.reshape(b - a, 8, n_cols, 8).min(axis=(1, 3)) > 0
    return out


def labels(stats_only=False):
    L = CFG["labels"]
    log("reading the DTM band ...")
    z, valid1 = read_band_dtm()
    log(f"DTM band {z.shape}, valid {valid1.mean():.1%}")
    slope, rough, valid = terrain_fields(z, valid1, L["rough_window_m"])
    del z
    if not stats_only:
        log("photo no-data mask ...")
        pv = photo_valid_2m(np.load(AI / "ortho_band.npy", mmap_mode="r"))
        log(f"photo valid {pv.mean():.1%}; DTM valid {valid.mean():.1%}; both {(pv & valid).mean():.1%}")
        valid &= pv
    cls = classes_from_fields(slope, rough, valid)
    q = [5, 25, 50, 75, 90, 95, 99, 99.9]
    out = {"shape": list(cls.shape), "valid_share": float(valid.mean()),
           "slope_percentiles": dict(zip(map(str, q), np.percentile(slope[valid], q).round(2).tolist())),
           "rough_percentiles": dict(zip(map(str, q), np.percentile(rough[valid], q).round(3).tolist())),
           "class_share": {n: float((cls == i).sum() / valid.sum()) for i, n in enumerate(L["classes"])},
           "rules": {k: v for k, v in L.items() if not k.startswith("_")}}
    log(json.dumps(out, indent=1))
    if stats_only:
        return
    np.save(AI / "labels_2m.npy", cls)
    np.save(AI / "slope_2m.npy", slope)
    np.save(AI / "rough_2m.npy", rough)
    out["sha256_labels"] = sha256(AI / "labels_2m.npy")
    (AI / "labels_2m.info.json").write_text(json.dumps(out, indent=1))
    log("labels written: " + str(AI / "labels_2m.npy"))


# ------------------------------------------------------------------ split
def block_origin(kx, ky):
    """Top-left 2 m cell (row, col) of block (kx, ky) in the band grid. Block (0, 0) is the walking area."""
    wb, bm = CFG["walk_box"], CFG["block_m"]
    x_left, y_top = wb["xmin"] + kx * bm, wb["ymax"] + ky * bm
    return int(round((CFG["band"]["y_top"] - y_top) / 2)), int(round((x_left - X0) / 2))


def split():
    S, L = CFG["split"], CFG["labels"]
    cls = np.load(AI / "labels_2m.npy")
    nb = int(CFG["block_m"] / 2)                            # cells per block side (750)
    t = S["tile_cells"]
    per_side = nb // t
    margin = (nb - per_side * t) // 2
    blocks = []
    for ky in range(CFG["blocks_y"][1], CFG["blocks_y"][0] - 1, -1):
        for kx in range(CFG["blocks_x"][0], CFG["blocks_x"][1] + 1):
            i0, j0 = block_origin(kx, ky)
            assert 0 <= i0 and i0 + nb <= cls.shape[0] and 0 <= j0 and j0 + nb <= cls.shape[1], (kx, ky)
            c = cls[i0:i0 + nb, j0:j0 + nb]
            counts = [int((c == k).sum()) for k in range(len(L["classes"]))]
            blocks.append({"kx": kx, "ky": ky, "i0": i0, "j0": j0, "valid_share": sum(counts) / c.size, "counts": counts})
    rng = np.random.default_rng(CFG["seed"])
    usable = [b for b in blocks if (b["kx"], b["ky"]) != (0, 0) and b["valid_share"] >= S["min_valid_share_block"]]
    order = rng.permutation(len(usable))
    for rank, idx in enumerate(order):
        usable[idx]["role"] = "test" if rank < S["test_blocks"] else "val" if rank < S["test_blocks"] + S["val_blocks"] else "train"
    for b in blocks:
        if (b["kx"], b["ky"]) == (0, 0):
            b["role"] = "walk"
        b.setdefault("role", "unused")
        tiles = []
        if b["role"] in ("val", "test", "walk"):
            for a in range(per_side):
                for c2 in range(per_side):
                    i, j = b["i0"] + margin + a * t, b["j0"] + margin + c2 * t
                    if (cls[i:i + t, j:j + t] != L["ignore_index"]).mean() >= S["tile_min_valid_share"]:
                        tiles.append([i, j])
        b["tiles"] = tiles
    summary = {}
    for role in ("train", "val", "test", "walk", "unused"):
        bs = [b for b in blocks if b["role"] == role]
        counts = np.sum([b["counts"] for b in bs], axis=0).tolist() if bs else [0] * len(L["classes"])
        summary[role] = {"blocks": len(bs), "tiles": sum(len(b["tiles"]) for b in bs), "cells_per_class": dict(zip(L["classes"], counts)),
                         "class_share": dict(zip(L["classes"], (np.array(counts) / max(1, sum(counts))).round(4).tolist()))}
    out = {"seed": CFG["seed"], "block_cells": nb, "tile_cells": t, "tiles_per_block_side": per_side, "margin_cells": margin,
           "gap_between_blocks_m": 2 * margin * 2, "summary": summary, "blocks": blocks}
    (AI / "split.json").write_text(json.dumps(out))
    log(json.dumps({k: v for k, v in out.items() if k != "blocks"}, indent=1))
    rows = {}
    for b in blocks:
        rows.setdefault(b["ky"], []).append({"train": "T", "val": "v", "test": "X", "walk": "W", "unused": "."}[b["role"]])
    log("block map (north at top; T train, v validation, X test, W walking area, . unused):")
    for ky in sorted(rows, reverse=True):
        log("  " + " ".join(rows[ky]))


if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else ""
    {"download": download, "labels": labels, "labels-stats": lambda: labels(True), "split": split}.get(step, lambda: sys.exit(__doc__))()
