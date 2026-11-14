# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Choose the planner's AI hazard weight (C_HAZARD in model/planner.py) by a small sweep.

For each weight the demo walk (start at the southern end of the rover track, all five science stops, back to the
start) and the 13 proof stretches are planned. Rule for the choice, fixed before looking at the numbers:
  1. the demo walk must stay safe: minimum walk-back margin may drop by at most MAX_MARGIN_LOSS_MIN minutes and
     the walk may get at most MAX_EXTRA_LENGTH longer than with weight 0;
  2. among the weights that pass, take the one with the lowest mean AI hazard along the demo walk;
     on a tie (within 0.005), take the smaller weight.
Writes model/out/hazard_weight_sweep.json and prints a table. Run:  uv run python model/sweep_hazard_weight.py
"""
import json, pathlib, sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from model.planner import Planner, default_start   # noqa: E402
from model.proof import run                         # noqa: E402

WEIGHTS = [0.0, 0.5, 1.0, 2.0, 4.0, 8.0]
MAX_MARGIN_LOSS_MIN = 10.0     # ASSUMPTION: accept up to 10 min less walk-back margin for lower hazard
MAX_EXTRA_LENGTH = 0.10        # ASSUMPTION: accept a walk up to 10% longer


def main():
    rows = []
    s = default_start()
    for w in WEIGHTS:
        pl = Planner(c_hazard=w)
        p = pl.plan(s, s, list(pl.stops))["properties"]
        hz = np.array(p["per_vertex"]["hazard"])
        _, proof, _ = run(pl, use_hazard=True)
        rows.append({"weight": w, "length_m": p["length_m"], "time_out_min": p["time_out_min"], "time_back_min": p["time_back_min"],
                     "margin_min": p["margin_min"], "slope_max_deg": p["slope_max_deg"], "hazard_mean": round(float(hz.mean()), 4),
                     "hazard_gt05_share": round(float((hz > 0.5).mean()), 4), "stop_order": [x["id"] for x in p["stops"]],
                     "proof_median_dist_m": proof["plan_median_m"], "proof_mean_hazard": proof["mean_hazard"]["plan"],
                     "proof_gt15": proof["gt15"]["plan"]})
    base = rows[0]
    for r in rows:
        r["passes"] = bool(base["margin_min"] - r["margin_min"] <= MAX_MARGIN_LOSS_MIN and r["length_m"] <= base["length_m"] * (1 + MAX_EXTRA_LENGTH))
    ok = [r for r in rows if r["passes"]]
    best = min(r["hazard_mean"] for r in ok)
    chosen = min((r for r in ok if r["hazard_mean"] <= best + 0.005), key=lambda r: r["weight"])
    out = {"rule": {"max_margin_loss_min": MAX_MARGIN_LOSS_MIN, "max_extra_length": MAX_EXTRA_LENGTH, "tie_tolerance": 0.005,
                    "text": "lowest mean AI hazard along the demo walk among weights that keep the margin loss and extra length within the limits; smaller weight on a tie"},
           "start": s, "selected_weight": chosen["weight"], "rows": rows}
    (ROOT / "model" / "out" / "hazard_weight_sweep.json").write_text(json.dumps(out, indent=1))
    print("weight | length m | out min | back min | margin min | max slope | mean hazard | hazard>0.5 | proof median m | proof mean hazard | passes")
    for r in rows:
        print(f"{r['weight']:6g} | {r['length_m']:8.1f} | {r['time_out_min']:7.1f} | {r['time_back_min']:8.1f} | {r['margin_min']:10.1f} | {r['slope_max_deg']:9.1f} | "
              f"{r['hazard_mean']:11.4f} | {r['hazard_gt05_share']:10.4f} | {r['proof_median_dist_m']:14.1f} | {r['proof_mean_hazard']:17.3f} | {r['passes']}")
    print("selected weight:", chosen["weight"])


if __name__ == "__main__":
    main()
