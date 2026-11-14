# Written with AI assistance (Claude).
"""STAND-IN route planner (PLAN.md D21). Replaced by Maryam's planner in model/ when it lands; same inputs/outputs.

Least-cost walking route over the real terrain grid (terrain/out/), visiting science stops, written as route.json
(contracts/route.schema.json). Every setting below is a labelled ASSUMPTION until docs/cost-model.md is filled.

Cost of one 2 m cell  = 1 + A_SLOPE*(slope/limit)^2 + B_ROUGH*rough + C_HAZARD*hazard - D_SCIENCE*science
                        (clamped to >= 0.1); cells steeper than SLOPE_LIMIT are blocked.
Walking speed         = Tobler (1993): 6*exp(-3.5*|tan(theta)+0.05|) km/h along the step, x SPEED_FACTOR (suit + Mars).
Time back (per point) = fastest walking time from that point back to the start (least-time field from the start).
Margin (per point)    = EVA_LIMIT_MIN - (time so far + time back).
Stop order            = every order is tried (<= 7 stops); the cheapest is kept.
"""
import csv, datetime, itertools, json, math, pathlib

import numpy as np
from skimage.graph import MCP_Geometric

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODEL_VERSION = "standin-basic-v1"
SLOPE_LIMIT = 25.0        # deg      ASSUMPTION
EVA_LIMIT_MIN = 240.0     # minutes  ASSUMPTION
SPEED_FACTOR = 0.6        # x Tobler ASSUMPTION (pressure suit, 0.38 g)
A_SLOPE, B_ROUGH, C_HAZARD, D_SCIENCE = 4.0, 0.5, 0.0, 0.5   # ASSUMPTION; hazard off until the AI layer exists
BLOCKED = 1e6
ASSUMPTIONS = [
    f"ASSUMPTION: slope limit {SLOPE_LIMIT:g} deg (cells steeper are blocked)",
    f"ASSUMPTION: EVA time limit {EVA_LIMIT_MIN:g} min",
    f"ASSUMPTION: walking speed = Tobler (1993) x {SPEED_FACTOR:g} for suit and Mars gravity",
    f"ASSUMPTION: cost weights slope {A_SLOPE:g}, roughness {B_ROUGH:g}, hazard {C_HAZARD:g} (AI layer not ready), science {D_SCIENCE:g}",
    "Stand-in planner (standin-basic-v1); will be replaced by the team planner in model/",
    "Science values are relative CRISM browse-product signals, not mineral amounts",
]


def _load(path, n):
    return np.fromfile(path, "<f4").reshape(n, n).astype("float64")


class Planner:
    def __init__(self, data_dir=ROOT / "terrain/out"):
        d = pathlib.Path(data_dir)
        self.grid = json.loads((d / "grid.json").read_text())
        n, self.cell = self.grid["width"], float(self.grid["cell_m"])
        self.n = n
        self.dem = _load(d / "dem.bin", n)
        self.slope = _load(d / "slope.bin", n)
        self.rough = _load(d / "rough.bin", n)
        self.science = _load(d / "science.bin", n) if (d / "science.bin").exists() else np.zeros((n, n))
        self.hazard = _load(d / "hazard.bin", n) if (d / "hazard.bin").exists() else np.zeros((n, n))
        self.stops = {}
        if (d / "stops.csv").exists():
            for r in csv.DictReader(open(d / "stops.csv", newline="", encoding="utf-8")):
                self.stops[r["id"]] = r
        self.blocked = self.slope > SLOPE_LIMIT
        # time to cross one cell (minutes), direction-free and conservative: uphill Tobler speed at the cell's slope
        v_flat = 6.0 * np.exp(-3.5 * (np.tan(np.radians(np.minimum(self.slope, 89.0))) + 0.05)) * SPEED_FACTOR   # km/h
        self.cell_minutes = np.where(self.blocked, BLOCKED, (self.cell / 1000.0) / v_flat * 60.0)
        self._cache = {}

    # ---------- helpers ----------
    def cost_grid(self, use_hazard=True):
        c = (1 + A_SLOPE * (self.slope / SLOPE_LIMIT) ** 2 + B_ROUGH * self.rough
             + (C_HAZARD * self.hazard if use_hazard else 0) - D_SCIENCE * self.science)
        return np.where(self.blocked, BLOCKED, np.maximum(c, 0.1))

    def to_cell(self, xy):
        x, y = xy
        r, c = int(-y // self.cell), int(x // self.cell)
        if not (0 <= r < self.n and 0 <= c < self.n):
            raise ValueError(f"point {xy} is outside the walking area")
        return r, c

    def cell_xyz(self, rc):
        r, c = rc
        return [round((c + 0.5) * self.cell, 2), round(-(r + 0.5) * self.cell, 2), round(float(self.dem[r, c]), 2)]

    def _mcp(self, key, cost, start):
        k = (key, start)
        if k not in self._cache:
            m = MCP_Geometric(cost, fully_connected=True)
            cum, _ = m.find_costs([start])
            self._cache[k] = (m, cum)
        return self._cache[k]

    def _tobler_minutes(self, a, b):
        (ra, ca), (rb, cb) = a, b
        d = self.cell * math.hypot(rb - ra, cb - ca)
        tan = (self.dem[rb, cb] - self.dem[ra, ca]) / d
        v = 6.0 * math.exp(-3.5 * abs(tan + 0.05)) * SPEED_FACTOR
        return d / 1000.0 / v * 60.0

    # ---------- main entry (same signature the service and Maryam's planner use) ----------
    def plan(self, start, end, stop_ids, use_hazard=True):
        cost = self.cost_grid(use_hazard)
        key = f"cost-{use_hazard}"
        nodes = {"START": self.to_cell(start), "END": self.to_cell(end)}
        for sid in stop_ids:
            if sid not in self.stops:
                raise ValueError(f"unknown stop id {sid}")
            nodes[sid] = (int(self.stops[sid]["row"]), int(self.stops[sid]["col"]))
        for name, rc in nodes.items():
            if self.blocked[rc]:
                raise ValueError(f"{name} is on blocked ground (slope {self.slope[rc]:.1f} deg > {SLOPE_LIMIT:g})")
        # pairwise least costs
        pair = {}
        for a in nodes:
            _, cum = self._mcp(key, cost, nodes[a])
            for b in nodes:
                pair[a, b] = cum[nodes[b]]
        best, best_order = math.inf, []
        for order in itertools.permutations(stop_ids):
            seq = ["START", *order, "END"]
            total = sum(pair[seq[i], seq[i + 1]] for i in range(len(seq) - 1))
            if total < best:
                best, best_order = total, list(order)
        if not math.isfinite(best) or best >= BLOCKED:
            raise ValueError("no safe route: the points are cut off by blocked ground")
        seq = ["START", *best_order, "END"]
        path, legs = [], []
        for a, b in zip(seq, seq[1:]):
            m, _ = self._mcp(key, cost, nodes[a])
            seg = [tuple(p) for p in m.traceback(nodes[b])]
            legs.append((a, b, len(path) if not path else len(path) - 1, seg))
            path += seg if not path else seg[1:]
        # per-vertex numbers
        _, back = self._mcp("time", self.cell_minutes, nodes["START"])
        t, ts = 0.0, [0.0]
        for a, b in zip(path, path[1:]):
            t += self._tobler_minutes(a, b)
            ts.append(t)
        back_v = [float(back[p]) for p in path]
        margin = [EVA_LIMIT_MIN - (ti + bi) for ti, bi in zip(ts, back_v)]
        coords = [self.cell_xyz(p) for p in path]
        length = sum(self.cell * math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(path, path[1:]))
        # time out = start -> last stop, time back = last stop -> end (direct route: back = fastest walk home from END)
        if len(legs) > 1:
            last_stop_idx = legs[-1][2]
            time_out, time_back = ts[last_stop_idx], ts[-1] - ts[last_stop_idx]
        else:
            time_out, time_back = ts[-1], back_v[-1]
        leg_out = []
        for a, b, i0, seg in legs:
            i1 = i0 + len(seg) - 1
            leg_out.append({"from": a, "to": b, "length_m": round(sum(self.cell * math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(seg, seg[1:])), 1),
                            "time_min": round(ts[i1] - ts[i0], 1)})
        stops_out = []
        for sid in best_order:
            s = self.stops[sid]
            x, y, _ = self.cell_xyz(nodes[sid])
            stops_out.append({"id": sid, "name": s["name"], "x": x, "y": y, "reason": s["reason"],
                              "science_value": float(s["science_value"]), "citation": s["source"]})
        return {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "frame": "jezero-local-v1",
                "plan_id": "standin-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S"),
                "created_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "length_m": round(length, 1),
                "time_out_min": round(time_out, 1),
                "time_back_min": round(time_back, 1),
                "margin_min": round(min(margin), 1),
                "slope_max_deg": round(max(float(self.slope[p]) for p in path), 1),
                "cost_weights": {"w_s": A_SLOPE, "w_r": B_ROUGH, "w_h": C_HAZARD if use_hazard else 0.0, "w_sci": D_SCIENCE},
                "model_version": MODEL_VERSION,
                "assumptions": ASSUMPTIONS,
                "legs": leg_out,
                "stops": stops_out,
                "per_vertex": {"t_min": [round(v, 2) for v in ts], "margin_min": [round(v, 2) for v in margin],
                               "slope_deg": [round(float(self.slope[p]), 2) for p in path],
                               "hazard": [round(float(self.hazard[p]), 3) for p in path]},
            },
        }


def default_start(data_dir=ROOT / "terrain/out"):
    """Southern-most point of Perseverance's path inside the area (crater floor, where a lander could be)."""
    rover = json.loads((pathlib.Path(data_dir) / "rover_path.json").read_text())
    pts = [c for f in rover["features"] for c in f["geometry"]["coordinates"]]
    x, y = min(pts, key=lambda p: p[1])
    return [round(x, 2), round(y, 2)]


if __name__ == "__main__":   # writes the demo route used as the static fallback
    import time
    p = Planner()
    s = default_start()
    t0 = time.time()
    route = p.plan(s, s, list(p.stops))
    out = ROOT / "pipeline/fallback"; out.mkdir(exist_ok=True)
    (out / "route.json").write_text(json.dumps(route))
    pr = route["properties"]
    print(f"planned in {time.time() - t0:.1f} s | start {s} | order {[x['id'] for x in pr['stops']]}")
    print(f"length {pr['length_m']} m | out {pr['time_out_min']} min | back {pr['time_back_min']} min | "
          f"min margin {pr['margin_min']} min | max slope {pr['slope_max_deg']} deg | points {len(route['geometry']['coordinates'])}")
