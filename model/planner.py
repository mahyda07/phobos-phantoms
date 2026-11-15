# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Route planner that uses the AI hazard layer (model/out/hazard.bin).

Same constructor and plan(start, end, stop_ids, use_hazard=True) as pipeline/planner_basic.py, which this class
extends: slope limit, walking speed, walk-back margin and stop ordering are unchanged. The only change is the cost
of one 2 m cell:

    cost = 1 + 4.0*(slope/25)^2 + 0.5*rough + C_HAZARD*hazard - 0.5*science      (clamped to >= 0.1)

hazard is the AI value 0..1 per cell (0.5 x P(careful) + 1.0 x P(avoid), see model/MODEL_CARD.md). The AI layer only
makes cells more expensive; it never blocks a cell (blocking stays with the measured slope > 25 deg from the DTM).
C_HAZARD is chosen by model/sweep_hazard_weight.py and documented in docs/cost-model.md.
Use it in the web service with the environment variable PLANNER=model (pipeline/api.py).
"""
import pathlib, sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from pipeline import planner_basic as pb  # noqa: E402

MODEL_VERSION = "ai-hazard-v1"
C_HAZARD = 4.0            # selected by model/sweep_hazard_weight.py (model/out/hazard_weight_sweep.json); see docs/cost-model.md
HAZARD_FILE = ROOT / "model" / "out" / "hazard.bin"


class Planner(pb.Planner):
    def __init__(self, data_dir=ROOT / "terrain/out", hazard_file=None, c_hazard=None):
        super().__init__(data_dir)
        self.c_hazard = C_HAZARD if c_hazard is None else float(c_hazard)
        d = pathlib.Path(data_dir)
        if hazard_file is not None:
            candidates = [pathlib.Path(hazard_file)]
        elif d.resolve() == (ROOT / "terrain/out").resolve():
            candidates = [HAZARD_FILE, d / "hazard.bin"]          # the AI track's own output first
        else:
            candidates = [d / "hazard.bin", HAZARD_FILE]
        self.hazard_source = "none (all zeros)"
        self.hazard = np.zeros((self.n, self.n))
        for f in candidates:
            if f.exists() and f.stat().st_size == self.n * self.n * 4:
                h = np.fromfile(f, "<f4").reshape(self.n, self.n).astype("float64")
                if not np.isfinite(h).all() or h.min() < 0 or h.max() > 1:
                    raise ValueError(f"{f} must hold values 0..1 without NaN")
                self.hazard, self.hazard_source = h, f.resolve().relative_to(ROOT).as_posix() if ROOT in f.resolve().parents else f.as_posix()
                break

    def cost_grid(self, use_hazard=True):
        c = (1 + pb.A_SLOPE * (self.slope / pb.SLOPE_LIMIT) ** 2 + pb.B_ROUGH * self.rough
             + (self.c_hazard * self.hazard if use_hazard else 0) - pb.D_SCIENCE * self.science)
        return np.where(self.blocked, pb.BLOCKED, np.maximum(c, 0.1))

    def plan(self, start, end, stop_ids, use_hazard=True):
        route = super().plan(start, end, stop_ids, use_hazard)
        p = route["properties"]
        w_h = self.c_hazard if use_hazard else 0.0
        p["model_version"] = MODEL_VERSION
        p["plan_id"] = "aihazard-" + p["plan_id"].split("-", 1)[-1]
        p["cost_weights"]["w_h"] = w_h
        hz = p["per_vertex"]["hazard"]
        p["hazard_mean"] = round(float(np.mean(hz)), 3)
        p["hazard_max"] = round(float(np.max(hz)), 3)
        p["assumptions"] = [
            f"ASSUMPTION: slope limit {pb.SLOPE_LIMIT:g} deg (cells steeper are blocked)",
            f"ASSUMPTION: EVA time limit {pb.EVA_LIMIT_MIN:g} min",
            f"ASSUMPTION: walking speed = Tobler (1993) x {pb.SPEED_FACTOR:g} for suit and Mars gravity",
            f"ASSUMPTION: cost weights slope {pb.A_SLOPE:g}, roughness {pb.B_ROUGH:g}, AI hazard {w_h:g}, science {pb.D_SCIENCE:g}",
            f"AI hazard layer: {self.hazard_source}; it raises the cost of a cell and never blocks one (see model/MODEL_CARD.md)",
            f"Planner {MODEL_VERSION}: pipeline/planner_basic.py plus the AI hazard term",
            "Science values are relative CRISM browse-product signals, not mineral amounts",
        ]
        return route


default_start = pb.default_start


if __name__ == "__main__":   # writes the demo route with the AI hazard layer: model/out/route.json
    import json, time
    pl = Planner()
    s = default_start()
    t0 = time.time()
    route = pl.plan(s, s, list(pl.stops))
    out = ROOT / "model" / "out"; out.mkdir(parents=True, exist_ok=True)
    (out / "route.json").write_text(json.dumps(route))
    pr = route["properties"]
    print(f"planned in {time.time() - t0:.1f} s | hazard from {pl.hazard_source} | weight {pl.c_hazard:g} | start {s} | order {[x['id'] for x in pr['stops']]}")
    print(f"length {pr['length_m']} m | out {pr['time_out_min']} min | back {pr['time_back_min']} min | min margin {pr['margin_min']} min | "
          f"max slope {pr['slope_max_deg']} deg | mean hazard {pr['hazard_mean']} | max hazard {pr['hazard_max']} | points {len(route['geometry']['coordinates'])}")
