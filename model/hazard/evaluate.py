# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Evaluate HazardNet on the held-out TEST blocks and compare it with two baselines.

  uv run python model/hazard/evaluate.py            # writes model/out/eval.json, confusion_matrix.png, examples.png

Baselines (same test cells, same labels):
  majority      : always answer the most common class ("go")
  photo-stats   : multinomial logistic regression on six simple brightness / texture numbers per 2 m cell,
                  fitted on the training blocks. Shows what the photo gives WITHOUT a deep network.
Every number in eval.json comes from this script. Test blocks were never used for training or model selection.
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))   # lets the scripts import each other when run by path
import json, sys, time

import numpy as np
import torch
import torch.nn.functional as F

from common import AI, CFG, ROOT, sha256
from net import HazardNet, to_input
from train import evaluate_tiles, get_batch, iou_from_cm, load_data, log

OUT = ROOT / "model" / "out"


def cm_report(cm, classes):
    ious, acc = iou_from_cm(torch.as_tensor(cm))
    return {"miou": float(np.nanmean(ious)), "per_class_iou": dict(zip(classes, [float(v) for v in ious])),
            "pixel_accuracy": acc, "confusion_rows_true_cols_pred": np.asarray(cm).tolist(), "cells": int(np.asarray(cm).sum())}


@torch.no_grad()
def photo_features(band, device, rows_per_chunk=96):
    """Six numbers per 2 m cell from the photo alone (no network): brightness, contrast and their neighbourhood forms."""
    n_r, n_c = band.shape[0] // 8, band.shape[1] // 8
    mean = torch.empty(n_r, n_c); std = torch.empty(n_r, n_c)
    for a in range(0, n_r, rows_per_chunk):
        b = min(a + rows_per_chunk, n_r)
        x = torch.from_numpy(np.ascontiguousarray(band[a * 8:b * 8, :n_c * 8])).to(device).float().div(255)[None, None]
        m = F.avg_pool2d(x, 8); v = (F.avg_pool2d(x * x, 8) - m * m).clamp(min=0).sqrt()
        mean[a:b], std[a:b] = m[0, 0].cpu(), v[0, 0].cpu()
    m, s = mean[None, None].to(device), std[None, None].to(device)
    kx = torch.tensor([[-1., 0., 1.], [-2., 0., 2.], [-1., 0., 1.]], device=device)[None, None] / 8
    grad = torch.hypot(F.conv2d(F.pad(m, (1, 1, 1, 1), mode="replicate"), kx), F.conv2d(F.pad(m, (1, 1, 1, 1), mode="replicate"), kx.transpose(2, 3)))
    pool5 = lambda z: F.avg_pool2d(F.pad(z, (2, 2, 2, 2), mode="replicate"), 5, stride=1)
    rng5 = F.max_pool2d(F.pad(m, (2, 2, 2, 2), mode="replicate"), 5, stride=1) + F.max_pool2d(F.pad(-m, (2, 2, 2, 2), mode="replicate"), 5, stride=1)
    return torch.cat([m, s, pool5(s), grad, pool5(grad), rng5], 1)[0].cpu()      # (6, n_r, n_c)


def cells_mask(shape, tiles, t):
    m = np.zeros(shape, bool)
    for i, j in tiles:
        m[i:i + t, j:j + t] = True
    return m


def photo_stats_baseline(feats, labels, split, test_mask, device, n_classes, ignore, seed):
    nb = split["block_cells"]
    train_mask = np.zeros(labels.shape, bool)
    for b in split["blocks"]:
        if b["role"] == "train":
            train_mask[b["i0"]:b["i0"] + nb, b["j0"]:b["j0"] + nb] = True
    train_mask &= labels != ignore
    rng = np.random.default_rng(seed)
    idx = np.flatnonzero(train_mask)
    idx = rng.choice(idx, size=min(len(idx), 4_000_000), replace=False)
    X = feats.reshape(6, -1)[:, idx].T.to(device); y = torch.from_numpy(labels.reshape(-1)[idx]).long().to(device)
    mu, sd = X.mean(0), X.std(0).clamp(min=1e-6)
    counts = torch.bincount(y, minlength=n_classes).float()
    w = (counts.sum() / counts) ** CFG["train"]["class_weight_power"]; w = w / w.mean()
    torch.manual_seed(seed)
    lin = torch.nn.Linear(6, n_classes).to(device)
    opt = torch.optim.LBFGS(lin.parameters(), lr=1.0, max_iter=200, history_size=20, line_search_fn="strong_wolfe")
    Xn = (X - mu) / sd

    def closure():
        opt.zero_grad(); loss = F.cross_entropy(lin(Xn), y, weight=w); loss.backward(); return loss
    opt.step(closure)
    tm = test_mask & (labels != ignore)
    tidx = np.flatnonzero(tm)
    with torch.no_grad():
        pred = torch.cat([lin((feats.reshape(6, -1)[:, tidx[a:a + 2_000_000]].T.to(device) - mu) / sd).argmax(1).cpu()
                          for a in range(0, len(tidx), 2_000_000)])
    yt = torch.from_numpy(labels.reshape(-1)[tidx]).long()
    cm = torch.bincount(yt * n_classes + pred, minlength=n_classes * n_classes).reshape(n_classes, n_classes)
    return cm.numpy(), {"train_cells_used": int(len(idx)), "features": ["mean brightness (8x8 px)", "brightness std (8x8 px)",
            "std averaged over 5x5 cells", "brightness gradient (Sobel)", "gradient averaged over 5x5 cells", "brightness range in 5x5 cells"]}


def figures(cm, classes, examples):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap
    cm = np.asarray(cm, float); norm = cm / cm.sum(1, keepdims=True).clip(min=1)
    fig, ax = plt.subplots(figsize=(5.2, 4.4), dpi=150)
    ax.imshow(norm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(classes)), classes); ax.set_yticks(range(len(classes)), classes)
    ax.set_xlabel("HazardNet prediction (from the photo)"); ax.set_ylabel("Label (rule on the 1 m DTM)")
    for i in range(len(classes)):
        for j in range(len(classes)):
            ax.text(j, i, f"{norm[i, j]:.1%}\n{int(cm[i, j]):,}", ha="center", va="center", fontsize=8,
                    color="white" if norm[i, j] > 0.5 else "black")
    ax.set_title("Held-out test blocks: confusion matrix\n(rows add to 100%)", fontsize=10)
    fig.tight_layout(); fig.savefig(OUT / "confusion_matrix.png"); plt.close(fig)
    cmap = ListedColormap(["#2e9e4f", "#f2c230", "#d6362b", "#555555"])
    fig, axes = plt.subplots(3, len(examples), figsize=(2.2 * len(examples), 6.8), dpi=130)
    for k, (title, img, lab, pred) in enumerate(examples):
        axes[0, k].imshow(img, cmap="gray", vmin=0, vmax=255); axes[0, k].set_title(title, fontsize=8)
        axes[1, k].imshow(np.where(lab == 255, 3, lab), cmap=cmap, vmin=0, vmax=3, interpolation="nearest")
        axes[2, k].imshow(pred, cmap=cmap, vmin=0, vmax=3, interpolation="nearest")
        for r in range(3): axes[r, k].set_xticks([]); axes[r, k].set_yticks([])
    axes[0, 0].set_ylabel("HiRISE photo (128 m)"); axes[1, 0].set_ylabel("label (DTM rule)"); axes[2, 0].set_ylabel("HazardNet")
    fig.suptitle("Test tiles: 3 best and 3 worst by cell accuracy (green go, yellow careful, red avoid, grey no data)", fontsize=9)
    fig.tight_layout(); fig.savefig(OUT / "examples.png"); plt.close(fig)


def main():
    L, seed = CFG["labels"], CFG["seed"]
    classes, ignore, n = L["classes"], L["ignore_index"], len(L["classes"])
    run = AI / "runs" / (sys.argv[1] if len(sys.argv) > 1 else CFG["train"]["run_name"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    OUT.mkdir(parents=True, exist_ok=True)
    band, labels, split = load_data()
    t = split["tile_cells"]
    test_tiles = [tuple(x) for b in split["blocks"] if b["role"] == "test" for x in b["tiles"]]
    val_tiles = [tuple(x) for b in split["blocks"] if b["role"] == "val" for x in b["tiles"]]
    ck = torch.load(run / "best.pt", map_location=device, weights_only=False)
    model = HazardNet(n).to(device).to(memory_format=torch.channels_last); model.load_state_dict(ck["model"]); model.eval()
    log(f"checkpoint {run / 'best.pt'} (epoch {ck['epoch']}), test tiles {len(test_tiles)}")
    cm_test, _ = evaluate_tiles(model, band, labels, test_tiles, t, device, n, ignore)
    cm_val, _ = evaluate_tiles(model, band, labels, val_tiles, t, device, n, ignore)
    rep = {"test": cm_report(cm_test.numpy(), classes), "validation": cm_report(cm_val.numpy(), classes)}
    # baselines on the same test cells
    test_mask = cells_mask(labels.shape, test_tiles, t)
    yt = labels[test_mask & (labels != ignore)]
    cm_major = np.zeros((n, n), np.int64); cm_major[:, 0] = np.bincount(yt, minlength=n)[:n]
    log("photo-statistics baseline ...")
    feats = photo_features(band, device)
    cm_ps, ps_info = photo_stats_baseline(feats, labels, split, test_mask, device, n, ignore, seed)
    base = {"majority_class": cm_report(cm_major, classes), "photo_stats_logistic_regression": {**cm_report(cm_ps, classes), **ps_info}}
    assert rep["test"]["cells"] == base["majority_class"]["cells"] == base["photo_stats_logistic_regression"]["cells"]
    # per-tile accuracy for the example figure
    accs = []
    with torch.no_grad():
        for a in range(0, len(test_tiles), 32):
            img, lab = get_batch(band, labels, test_tiles[a:a + 32], t, device)
            with torch.autocast("cuda", enabled=device.type == "cuda"):
                pred = model(to_input(img).contiguous(memory_format=torch.channels_last)).argmax(1)
            ok = ((pred == lab) & (lab != ignore)).flatten(1).sum(1).float() / (lab != ignore).flatten(1).sum(1).clamp(min=1)
            mixed = ((lab == 1) | (lab == 2)).flatten(1).float().mean(1)
            accs += [(float(o), float(mx), test_tiles[a + k], pred[k].cpu().numpy()) for k, (o, mx) in enumerate(zip(ok, mixed))]
    cand = [x for x in accs if x[1] > 0.05] or accs            # tiles with at least 5% careful/avoid cells
    cand.sort(key=lambda x: x[0])
    picks = [("best", x) for x in cand[::-1][:3]] + [("worst", x) for x in cand[:3]]
    ex = [(f"{tag}: {x[0]:.0%} correct", band[x[2][0] * 8:(x[2][0] + t) * 8, x[2][1] * 8:(x[2][1] + t) * 8],
           labels[x[2][0]:x[2][0] + t, x[2][1]:x[2][1] + t], x[3]) for tag, x in picks]
    figures(cm_test.numpy(), classes, ex)
    info = json.loads((run / "train_info.json").read_text()) if (run / "train_info.json").exists() else {}
    out = {"model": "HazardNet (U-Net style, trained from scratch)", "run": run.name, "checkpoint_epoch": int(ck["epoch"]),
           "checkpoint_sha256": sha256(run / "best.pt"), "classes": classes, "labels_rule": {k: v for k, v in L.items() if not k.startswith("_")},
           "hazardnet": rep, "baselines": base,
           "split": {k: split["summary"][k] for k in ("train", "val", "test", "walk")}, "gap_between_blocks_m": split["gap_between_blocks_m"],
           "training": info, "seed": seed, "created": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "note": "Labels are rule-based classes from the USGS 1 m DTM (Maryam's walkability rule). The network sees only the 25 cm photo. "
                   "Test = whole 1.5 km blocks never used for training or for choosing the checkpoint."}
    (OUT / "eval.json").write_text(json.dumps(out, indent=1))
    log(json.dumps({"hazardnet_test": {k: rep["test"][k] for k in ("miou", "per_class_iou", "pixel_accuracy")},
                    "majority": {k: base["majority_class"][k] for k in ("miou", "per_class_iou", "pixel_accuracy")},
                    "photo_stats": {k: base["photo_stats_logistic_regression"][k] for k in ("miou", "per_class_iou", "pixel_accuracy")}}, indent=1))


if __name__ == "__main__":
    main()
