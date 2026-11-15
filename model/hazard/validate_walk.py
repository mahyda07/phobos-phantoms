# Written with AI assistance (Claude), run 2 (Ramish's session, change in Maryam's folder, logged). Track [P1].
"""Validate the AI hazard layer on the WALKING AREA, which HazardNet never saw in training or checkpoint choice
(model/MODEL_CARD.md: 'never used for training or for choosing the checkpoint').

Two independent checks, all numbers written to model/out/validation_walk.json:
 1. Against Maryam's go / careful / avoid rule (model/maryam/score.py) recomputed from the walking area's 2 m slope and
    roughness grids (terrain/out). Note: training labels came from the 1 m DTM, so these labels are close to, not
    identical with, the training labels. Reports mIoU, per-class IoU, accuracy, and the same for two baselines.
 2. Against Perseverance's real drives (terrain/out/rover_path.json, NASA/JPL-Caltech): ground the rover actually drove
    should mostly be low-hazard. Reports mean hazard and the share of 'avoid' cells on rover cells vs the whole area.
This is a validation of the map against terrain data and rover experience, not of astronaut safety.

    uv run python model/hazard/validate_walk.py
"""
import json
import pathlib
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from model.maryam.score import safety_score, GO_MIN, CAREFUL_MIN  # noqa: E402

T = ROOT / "terrain" / "out"
grid = json.loads((T / "grid.json").read_text(encoding="utf-8"))
n, cell = grid["height"], grid["cell_m"]
hz = np.fromfile(T / "hazard.bin", dtype="<f4").reshape(n, n)
slope = np.fromfile(T / "slope.bin", dtype="<f4").reshape(n, n)
rough = np.fromfile(T / "rough.bin", dtype="<f4").reshape(n, n)

valid = np.isfinite(hz) & np.isfinite(slope) & np.isfinite(rough)
score = safety_score(slope, rough)
truth = np.where(score >= GO_MIN, 0, np.where(score >= CAREFUL_MIN, 1, 2))          # 0 go, 1 careful, 2 avoid
pred = np.where(hz < 0.25, 0, np.where(hz < 0.75, 1, 2))                             # hazard value 0 / 0.5 / 1 per class


def metrics(p, t, m):
    p, t = p[m], t[m]
    ious = []
    for k in range(3):
        inter = np.sum((p == k) & (t == k)); union = np.sum((p == k) | (t == k))
        ious.append(float(inter / union) if union else float("nan"))
    conf = [[int(np.sum((t == a) & (p == b))) for b in range(3)] for a in range(3)]
    return {"miou": float(np.nanmean(ious)), "iou": dict(zip(["go", "careful", "avoid"], ious)),
            "accuracy": float(np.mean(p == t)), "confusion_rows_true_cols_pred": conf, "cells": int(m.sum())}


hn = metrics(pred, truth, valid)
majority = metrics(np.zeros_like(truth), truth, valid)
slope_only = metrics(np.where(slope < 10, 0, np.where(slope < 25, 1, 2)), truth, valid)   # slope-threshold baseline

# Perseverance's drives: rasterise the traverse onto the grid
rover = json.loads((T / "rover_path.json").read_text(encoding="utf-8"))
on = np.zeros((n, n), bool)
for f in rover["features"]:
    c = np.asarray(f["geometry"]["coordinates"], float)
    for (x0, y0), (x1, y1) in zip(c[:-1], c[1:]):
        k = max(2, int(np.hypot(x1 - x0, y1 - y0) / (cell / 2)))
        xs, ys = np.linspace(x0, x1, k), np.linspace(y0, y1, k)
        r, cc = (-ys // cell).astype(int), (xs // cell).astype(int)
        ok = (r >= 0) & (r < n) & (cc >= 0) & (cc < n)
        on[r[ok], cc[ok]] = True
rv = on & valid
rover_check = {
    "rover_cells": int(rv.sum()),
    "mean_hazard_rover": float(hz[rv].mean()), "mean_hazard_area": float(hz[valid].mean()),
    "share_avoid_rover": float(np.mean(pred[rv] == 2)), "share_avoid_area": float(np.mean(pred[valid] == 2)),
    "share_go_rover": float(np.mean(pred[rv] == 0)), "share_go_area": float(np.mean(pred[valid] == 0)),
}

out = {
    "what": "Validation of the AI hazard layer on the held-out walking area (never used for training or checkpoint choice)",
    "labels": "Maryam's rule (model/maryam/score.py) on terrain/out slope.bin + rough.bin (2 m); training used 1 m DTM labels",
    "pred_classes_from_hazard": "hazard < 0.25 go, < 0.75 careful, else avoid (class values 0 / 0.5 / 1)",
    "hazardnet": hn, "baseline_majority_go": majority, "baseline_slope_threshold_10_25": slope_only,
    "perseverance_check": rover_check,
    "limits": "Checks the map against terrain-derived labels and rover experience; not a validation of astronaut walking safety.",
}
(ROOT / "model" / "out" / "validation_walk.json").write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
print(json.dumps({"hazardnet_miou": round(hn["miou"], 3), "acc": round(hn["accuracy"], 3), "iou": {k: round(v, 3) for k, v in hn["iou"].items()},
                  "majority_miou": round(majority["miou"], 3), "slope_baseline_miou": round(slope_only["miou"], 3),
                  "rover": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in rover_check.items()}}, indent=1))
