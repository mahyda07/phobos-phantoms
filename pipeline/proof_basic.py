# Written with AI assistance (Claude).
"""STAND-IN proof against Perseverance (PLAN.md D27). Replaced by Maryam's results when model/out/results.md lands.

Question: does our terrain cost model choose ground like the people who drove Perseverance did?
Perseverance's real track inside the walking area (terrain/out/rover_path.json, sols 405-717, joined in sol
order) is cut into stretches of about LEG_M metres along the track. For each stretch we plan a route from its
real start to its real end with the stand-in planner (no science stops) and compare three lines:
the rover's track, our planned route, and a straight line between the same two points (the baseline).
  - distance from each line's points to the rover track (median, 90th percentile, max)
  - share of ground steeper than 15 deg and 25 deg under each line, steepest point under each line
The straight line shows what "no terrain model" would do; a useful model stays near the rover AND
avoids the steep ground that the straight line crosses.
Honest limits: a rover is not an astronaut (different speed, wheels, goals: rovers also detour for science
and for engineering reasons we do not see). This checks the terrain model, not astronaut safety.
Writes results.md (repo root, read by the web display's proof view) and pipeline/fallback/results.json.
Run from the repo root:  uv run python pipeline/proof_basic.py
"""
import datetime, json, math, pathlib, sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from planner_basic import Planner, MODEL_VERSION, ROOT  # noqa: E402

LEG_M = 500.0   # length of one stretch of rover track (metres along the track)


def seg_dist(p, a, b):
    """Distance from point p to segment ab (2-D, metres)."""
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def dist_to_line(points, line):
    a = np.array(line[:-1]); b = np.array(line[1:])
    out = []
    for p in points:
        d = b - a
        L2 = (d ** 2).sum(1)
        t = np.clip(((p - a) * d).sum(1) / np.where(L2 == 0, 1, L2), 0, 1)
        proj = a + d * t[:, None]
        out.append(float(np.sqrt(((proj - p) ** 2).sum(1)).min()))
    return np.array(out)


def length(line):
    return sum(math.dist(line[i], line[i + 1]) for i in range(len(line) - 1))


def slope_along(pl, line, step=1.0):
    """Slope (deg) sampled every `step` metres along a polyline."""
    vals = []
    for (x0, y0), (x1, y1) in zip(line, line[1:]):
        n = max(1, int(math.dist((x0, y0), (x1, y1)) / step))
        for k in range(n):
            x, y = x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n
            try:
                vals.append(float(pl.slope[pl.to_cell((x, y))]))
            except ValueError:
                pass
    return np.array(vals)


def main():
    pl = Planner()
    rover = json.loads((ROOT / "terrain/out/rover_path.json").read_text())
    feats = sorted(rover["features"], key=lambda f: f["properties"].get("sol", 0))
    track, sols = [], []
    for f in feats:
        for c in f["geometry"]["coordinates"]:
            if not track or math.dist(track[-1], c[:2]) > 1e-6:
                track.append(tuple(c[:2])); sols.append(f["properties"].get("sol"))
    # cut into stretches of ~LEG_M along the track (last short piece joins the previous stretch)
    cuts, acc = [0], 0.0
    for i in range(1, len(track)):
        acc += math.dist(track[i - 1], track[i])
        if acc >= LEG_M:
            cuts.append(i); acc = 0.0
    if cuts[-1] != len(track) - 1:
        if acc < LEG_M / 2 and len(cuts) > 1: cuts[-1] = len(track) - 1
        else: cuts.append(len(track) - 1)
    rows, D, S = [], [], []
    slopes = {"rover": [], "plan": [], "straight": []}
    for a, b in zip(cuts, cuts[1:]):
        line = track[a:b + 1]
        try:
            r = pl.plan(list(line[0]), list(line[-1]), [], use_hazard=True)
        except ValueError as e:
            rows.append({"sols": f"{sols[a]}-{sols[b]}", "skipped": str(e)}); continue
        plan_xy = [tuple(c[:2]) for c in r["geometry"]["coordinates"]]
        straight = [line[0], line[-1]]
        d = dist_to_line(np.array(plan_xy), line)
        n = max(2, int(math.dist(line[0], line[-1]) / pl.cell))
        st_pts = np.array([[line[0][0] + (line[-1][0] - line[0][0]) * k / n, line[0][1] + (line[-1][1] - line[0][1]) * k / n] for k in range(n + 1)])
        sd = dist_to_line(st_pts, line)
        D.append(d); S.append(sd)
        rs, ps, ss = slope_along(pl, line), slope_along(pl, plan_xy), slope_along(pl, straight)
        slopes["rover"].append(rs); slopes["plan"].append(ps); slopes["straight"].append(ss)
        rows.append({"sols": f"{sols[a]}-{sols[b]}", "rover_m": round(length(line), 1), "plan_m": r["properties"]["length_m"],
                     "straight_m": round(math.dist(line[0], line[-1]), 1),
                     "plan_median_m": round(float(np.median(d)), 1), "straight_median_m": round(float(np.median(sd)), 1),
                     "plan_max_m": round(float(d.max()), 1), "straight_max_m": round(float(sd.max()), 1),
                     "rover_max_slope": round(float(rs.max()), 1), "plan_max_slope": round(float(ps.max()), 1),
                     "straight_max_slope": round(float(ss.max()), 1)})
    ok = [r for r in rows if "skipped" not in r]
    D, S = np.concatenate(D), np.concatenate(S)
    sl = {k: np.concatenate(v) for k, v in slopes.items()}
    f15 = {k: round(float((v > 15).mean()), 4) for k, v in sl.items()}
    f25 = {k: round(float((v > 25).mean()), 4) for k, v in sl.items()}
    mx = {k: round(float(v.max()), 1) for k, v in sl.items()}
    straight_steep_legs = sum(1 for r in ok if r["straight_max_slope"] > 25)
    summary = {
        "stretches": len(ok), "skipped": len(rows) - len(ok), "leg_m": LEG_M,
        "plan_median_m": round(float(np.median(D)), 1), "plan_p90_m": round(float(np.percentile(D, 90)), 1), "plan_max_m": round(float(D.max()), 1),
        "straight_median_m": round(float(np.median(S)), 1), "straight_p90_m": round(float(np.percentile(S, 90)), 1), "straight_max_m": round(float(S.max()), 1),
        "plan_within_25m": round(float((D <= 25).mean()), 3), "straight_within_25m": round(float((S <= 25).mean()), 3),
        "gt15": f15, "gt25": f25, "max_slope": mx, "straight_stretches_over_25deg": straight_steep_legs,
        "length_ratio_median": round(float(np.median([r["plan_m"] / r["rover_m"] for r in ok])), 2),
        "area_gt15": round(float((pl.slope > 15).mean()), 4), "area_gt25": round(float((pl.slope > 25).mean()), 4),
        "planner": MODEL_VERSION,
        "created_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    out = ROOT / "pipeline/fallback"; out.mkdir(exist_ok=True)
    (out / "results.json").write_text(json.dumps({"summary": summary, "stretches": rows}, indent=1))
    pct = lambda v: f"{100 * v:.1f}%"
    md = f"""# Proof vs Perseverance (stand-in, {MODEL_VERSION})

Stand-in check by the pipeline track until the planner team's results are published. Perseverance's real track in the walking area (sols 405–717, {rover["total_length_m"] / 1000:.2f} km) is cut into {summary['stretches']} stretches of about {LEG_M:g} m. For each stretch our planner plans a route between the rover's real start and end, and we compare it with the rover's track and with a straight line between the same points. A rover is not an astronaut: this checks our terrain model, not astronaut safety.

| Measure | Our planner | Straight line | Perseverance |
|---|---|---|---|
| Distance from rover track, median | {summary['plan_median_m']} m | {summary['straight_median_m']} m | 0 m |
| Distance from rover track, 90th percentile | {summary['plan_p90_m']} m | {summary['straight_p90_m']} m | 0 m |
| Points within 25 m of rover track | {pct(summary['plan_within_25m'])} | {pct(summary['straight_within_25m'])} | 100% |
| Ground steeper than 15° | {pct(f15['plan'])} | {pct(f15['straight'])} | {pct(f15['rover'])} |
| Ground steeper than 25° | {pct(f25['plan'])} | {pct(f25['straight'])} | {pct(f25['rover'])} |
| Steepest ground | {mx['plan']}° | {mx['straight']}° | {mx['rover']}° |

Whole walking area: {pct(summary['area_gt15'])} of ground is steeper than 15°, {pct(summary['area_gt25'])} steeper than 25° (our walking limit). Planned length / rover length (median): {summary['length_ratio_median']}. Straight lines cross ground steeper than 25° in {straight_steep_legs} of {summary['stretches']} stretches.

Slope is from the 2 m grid built from the USGS Mars 2020 HiRISE DTM; the rover track is NASA/JPL-Caltech M20_traverse.json. Per-stretch numbers: pipeline/fallback/results.json. Made by pipeline/proof_basic.py.
"""
    (ROOT / "results.md").write_text(md, encoding="utf-8")
    print(md)


if __name__ == "__main__":
    main()
