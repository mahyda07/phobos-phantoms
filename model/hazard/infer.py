# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Run HazardNet on the walking area and write the hazard layer on the team's 750 x 750 grid (2 m cells).

  uv run python model/hazard/infer.py        # needs model/out/eval.json (run evaluate.py first)

Writes into model/out/:
  hazard.bin           float32 little-endian, 750 x 750, row 0 = north edge, values 0..1, no NaN
                       hazard = 0.5 x P(careful) + 1.0 x P(avoid)   (class probabilities of the network per 2 m cell)
  hazard_classes.bin   uint8, 750 x 750, most likely class per cell (0 go, 1 careful, 2 avoid)
  hazard.png           750 x 750 RGBA overlay (transparent where hazard is 0; yellow to red as hazard rises)
  hazard_preview.png   photo | photo + AI hazard | classes from the DTM rule (for a visual check)
  hazard.meta.json     contracts/hazard.meta.schema.json
  hazard_stats.json    shares per hazard group, hazard along Perseverance's track vs the whole area,
                       agreement with the DTM rule on the walking area (the network never saw this area)
The network predicts one value per 8 x 8 photo pixels, and those blocks ARE the team's 2 m cells (same corner,
same projection), so nothing is resampled. Tiles overlap by half and their probabilities are averaged.
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))   # lets the scripts import each other when run by path
import json, sys, time

import numpy as np
import torch

from common import AI, CFG, DATA, ROOT, sha256
from net import HazardNet, to_input
from prepare_data import block_origin
from train import iou_from_cm, log

OUT = ROOT / "model" / "out"
TERRAIN = ROOT / "terrain" / "out"


@torch.no_grad()
def predict_area(model, band, i0, j0, n, t, device, n_classes):
    """Class probabilities for the n x n cells starting at band cell (i0, j0); tiles of t cells, half overlap, with margin."""
    half = t // 2
    lo_i, lo_j = i0 - half, j0 - half
    size = n + 2 * half
    steps = list(range(0, size - t + 1, half))
    if steps[-1] != size - t: steps.append(size - t)
    acc = torch.zeros(n_classes, size, size, device=device); wsum = torch.zeros(size, size, device=device)
    win = torch.hann_window(t + 2, periodic=False, device=device)[1:-1]
    w2 = win[:, None] * win[None, :]
    for a in steps:
        tiles = [(lo_i + a, lo_j + b) for b in steps]
        img = torch.from_numpy(np.stack([band[i * 8:(i + t) * 8, j * 8:(j + t) * 8] for i, j in tiles])).to(device)
        with torch.autocast("cuda", enabled=device.type == "cuda"):
            p = model(to_input(img).contiguous(memory_format=torch.channels_last)).float().softmax(1)
        for k, b in enumerate(steps):
            acc[:, a:a + t, b:b + t] += p[k] * w2; wsum[a:a + t, b:b + t] += w2
    prob = acc / wsum.clamp(min=1e-6)
    return prob[:, half:half + n, half:half + n].cpu().numpy()


def along_track(values, grid_cell, track_features, step=1.0):
    out = []
    n = values.shape[0]
    for f in track_features:
        pts = f["geometry"]["coordinates"]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            k = max(1, int(np.hypot(x1 - x0, y1 - y0) / step))
            for q in range(k):
                x, y = x0 + (x1 - x0) * q / k, y0 + (y1 - y0) * q / k
                r, c = int(-y // grid_cell), int(x // grid_cell)
                if 0 <= r < n and 0 <= c < n:
                    out.append(values[r, c])
    return np.array(out)


def main():
    L = CFG["labels"]
    classes, n_classes = L["classes"], len(L["classes"])
    run = AI / "runs" / (sys.argv[1] if len(sys.argv) > 1 else CFG["train"]["run_name"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    grid = json.loads((TERRAIN / "grid.json").read_text())
    n = grid["width"]
    wb = CFG["walk_box"]
    assert grid["frame"] == "jezero-local-v1" and grid["height"] == n and float(grid["cell_m"]) == 2.0
    assert grid["origin_eqc"] == [wb["xmin"], wb["ymax"]] and n * 2.0 == wb["xmax"] - wb["xmin"], "grid.json does not match the walking box"
    ev = json.loads((OUT / "eval.json").read_text())
    ck = torch.load(run / "best.pt", map_location=device, weights_only=False)
    digest = sha256(run / "best.pt")
    assert digest == ev["checkpoint_sha256"], "eval.json was made with a different checkpoint: run evaluate.py again"
    model = HazardNet(n_classes).to(device).to(memory_format=torch.channels_last); model.load_state_dict(ck["model"]); model.eval()
    band = np.load(AI / "ortho_band.npy", mmap_mode="r")
    i0, j0 = block_origin(0, 0)
    # the photo under these cells must be the team's photo crop, pixel for pixel
    import rasterio
    with rasterio.open(DATA / CFG["walk_photo_file"]) as ds:
        ref = ds.read(1)
    assert np.array_equal(np.asarray(band[i0 * 8:(i0 + n) * 8, j0 * 8:(j0 + n) * 8]), ref), "band window != photo_25cm.tif"
    prob = predict_area(model, band, i0, j0, n, CFG["split"]["tile_cells"], device, n_classes)
    hv = np.array([L["hazard_value"][c] for c in classes], np.float32)
    hazard = np.clip((prob * hv[:, None, None]).sum(0), 0.0, 1.0).astype("<f4")
    cls = prob.argmax(0).astype(np.uint8)
    assert hazard.shape == (n, n) and np.isfinite(hazard).all()
    OUT.mkdir(parents=True, exist_ok=True)
    hazard.tofile(OUT / "hazard.bin"); cls.tofile(OUT / "hazard_classes.bin")
    # ---- pictures
    from PIL import Image
    g = hazard
    rgba = np.zeros((n, n, 4), np.uint8)
    rgba[..., 0] = 255; rgba[..., 1] = (220 * (1 - g)).astype(np.uint8); rgba[..., 2] = 30
    rgba[..., 3] = (np.clip(g * 1.6, 0, 1) * 200).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(OUT / "hazard.png")
    photo = Image.open(TERRAIN / "photo.png").convert("RGB").resize((n, n))
    over = Image.alpha_composite(photo.convert("RGBA"), Image.fromarray(rgba, "RGBA")).convert("RGB")
    # ---- agreement with the DTM rule on the walking area (never used in training)
    labels = np.load(AI / "labels_2m.npy")[i0:i0 + n, j0:j0 + n]
    valid = labels != L["ignore_index"]
    cm = np.bincount(labels[valid].astype(np.int64) * n_classes + cls[valid], minlength=n_classes ** 2).reshape(n_classes, n_classes)
    ious, acc = iou_from_cm(torch.as_tensor(cm))
    pal = np.array([[46, 158, 79], [242, 194, 48], [214, 54, 43], [85, 85, 85]], np.uint8)
    lab_img = Image.fromarray(pal[np.where(valid, labels, 3)])
    cls_img = Image.fromarray(pal[cls])
    sheet = Image.new("RGB", (4 * n + 30, n), "white")
    for k, im in enumerate([photo, over, cls_img, lab_img]): sheet.paste(im, (k * (n + 10), 0))
    sheet.save(OUT / "hazard_preview.png")
    # ---- statistics
    rover = json.loads((TERRAIN / "rover_path.json").read_text())
    tr_h = along_track(hazard, 2.0, rover["features"]); tr_c = along_track(cls, 2.0, rover["features"])
    share = lambda a: {c: float((a == k).mean()) for k, c in enumerate(classes)}
    stats = {
        "walking_area": {"cells": int(n * n), "mean_hazard": float(hazard.mean()), "median_hazard": float(np.median(hazard)),
                         "share_by_class": share(cls), "share_hazard_over_0.5": float((hazard > 0.5).mean())},
        "perseverance_track": {"samples_every_m": 1.0, "samples": int(len(tr_h)), "mean_hazard": float(tr_h.mean()),
                               "median_hazard": float(np.median(tr_h)), "share_by_class": share(tr_c),
                               "share_hazard_over_0.5": float((tr_h > 0.5).mean())},
        "agreement_with_dtm_rule_on_walking_area": {
            "miou": float(np.nanmean(ious)), "per_class_iou": dict(zip(classes, [float(v) for v in ious])), "pixel_accuracy": acc,
            "confusion_rows_true_cols_pred": cm.tolist(), "label_share": share(labels[valid]),
            "note": "The walking area was never used for training or model selection; labels here are the DTM rule (Maryam's score)."},
        "created": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    (OUT / "hazard_stats.json").write_text(json.dumps(stats, indent=1))
    meta = {
        "frame": "jezero-local-v1", "model": "hazardnet-v1 (U-Net style, trained from scratch on HiRISE 25 cm photo; labels from the USGS 1 m DTM)",
        "version": CFG["model_version"], "classes": classes, "hazard_groups": L["hazard_groups"],
        "metrics": {"miou": ev["hazardnet"]["test"]["miou"], "per_class_iou": ev["hazardnet"]["test"]["per_class_iou"],
                    "pixel_accuracy": ev["hazardnet"]["test"]["pixel_accuracy"],
                    "baseline_majority_miou": ev["baselines"]["majority_class"]["miou"],
                    "baseline_photo_stats_miou": ev["baselines"]["photo_stats_logistic_regression"]["miou"],
                    "walking_area_miou_vs_dtm_rule": stats["agreement_with_dtm_rule_on_walking_area"]["miou"],
                    "source": "model/out/eval.json (held-out test blocks) and model/out/hazard_stats.json"},
        "file": "hazard.bin", "cell_m": 2.0, "width": n, "height": n, "dtype": "float32-le",
        "classes_file": "hazard_classes.bin", "classes_dtype": "uint8",
        "value": "hazard = 0.5 x P(careful) + 1.0 x P(avoid), probabilities from the network for each 2 m cell (8 x 8 photo pixels)",
        "checkpoint_sha256": digest, "created": stats["created"],
    }
    (OUT / "hazard.meta.json").write_text(json.dumps(meta, indent=1))
    log(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
