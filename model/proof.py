# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Proof against Perseverance WITH the AI hazard layer. Same method and table as pipeline/proof_basic.py
(stretches of about 500 m of the rover's real track; our route vs a straight line vs the rover), plus:
  - the AI hazard under each of the three lines,
  - the same routes planned without the hazard layer (weight 0), to show what the layer changes.
Honest limits: a rover is not an astronaut, and the rover drivers never saw our hazard layer. Low hazard under
the rover's track is a sanity check of the layer, not proof that it is right.
Writes model/out/results.md (read by the web map's proof view through GET /results) and model/out/results.json.
Run from the repo root:  uv run python model/proof.py
"""
import datetime, json, math, pathlib, sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from model.planner import MODEL_VERSION, Planner          # noqa: E402
from pipeline.proof_basic import LEG_M, dist_to_line, length  # noqa: E402


def along(pl, grid, line, step=1.0):
    """Values of a grid layer sampled every `step` metres along a polyline."""
    vals = []
    for (x0, y0), (x1, y1) in zip(line, line[1:]):
        n = max(1, int(math.dist((x0, y0), (x1, y1)) / step))
        for k in range(n):
            x, y = x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n
            try:
                vals.append(float(grid[pl.to_cell((x, y))]))
            except ValueError:
                pass
    return np.array(vals)


def rover_track(root=ROOT):
    rover = json.loads((root / "terrain/out/rover_path.json").read_text())
    feats = sorted(rover["features"], key=lambda f: f["properties"].get("sol", 0))
    track, sols = [], []
    for f in feats:
        for c in f["geometry"]["coordinates"]:
            if not track or math.dist(track[-1], c[:2]) > 1e-6:
                track.append(tuple(c[:2])); sols.append(f["properties"].get("sol"))
    cuts, acc = [0], 0.0
    for i in range(1, len(track)):
        acc += math.dist(track[i - 1], track[i])
        if acc >= LEG_M:
            cuts.append(i); acc = 0.0
    if cuts[-1] != len(track) - 1:
        if acc < LEG_M / 2 and len(cuts) > 1: cuts[-1] = len(track) - 1
        else: cuts.append(len(track) - 1)
    return rover, track, sols, cuts


def run(pl, use_hazard=True):
    """Plan every stretch; return per-stretch rows and pooled samples."""
    rover, track, sols, cuts = rover_track()
    rows, D, S = [], [], []
    pool = {k: {"slope": [], "hazard": []} for k in ("rover", "plan", "straight")}
    for a, b in zip(cuts, cuts[1:]):
        line = track[a:b + 1]
        try:
            r = pl.plan(list(line[0]), list(line[-1]), [], use_hazard=use_hazard)
        except ValueError as e:
            rows.append({"sols": f"{sols[a]}-{sols[b]}", "skipped": str(e)}); continue
        plan_xy = [tuple(c[:2]) for c in r["geometry"]["coordinates"]]
        straight = [line[0], line[-1]]
        d = dist_to_line(np.array(plan_xy), line)
        n = max(2, int(math.dist(line[0], line[-1]) / pl.cell))
        st_pts = np.array([[line[0][0] + (line[-1][0] - line[0][0]) * k / n, line[0][1] + (line[-1][1] - line[0][1]) * k / n] for k in range(n + 1)])
        sd = dist_to_line(st_pts, line)
        D.append(d); S.append(sd)
        row = {"sols": f"{sols[a]}-{sols[b]}", "rover_m": round(length(line), 1), "plan_m": r["properties"]["length_m"],
               "straight_m": round(math.dist(line[0], line[-1]), 1),
               "plan_median_m": round(float(np.median(d)), 1), "straight_median_m": round(float(np.median(sd)), 1)}
        for name, ln in (("rover", line), ("plan", plan_xy), ("straight", straight)):
            sl, hz = along(pl, pl.slope, ln), along(pl, pl.hazard, ln)
            pool[name]["slope"].append(sl); pool[name]["hazard"].append(hz)
            row[f"{name}_max_slope"] = round(float(sl.max()), 1); row[f"{name}_mean_hazard"] = round(float(hz.mean()), 3)
        rows.append(row)
    ok = [r for r in rows if "skipped" not in r]
    D, S = np.concatenate(D), np.concatenate(S)
    P = {k: {m: np.concatenate(v[m]) for m in v} for k, v in pool.items()}
    summary = {
        "stretches": len(ok), "skipped": len(rows) - len(ok), "leg_m": LEG_M, "use_hazard": use_hazard, "hazard_weight": pl.c_hazard if use_hazard else 0.0,
        "plan_median_m": round(float(np.median(D)), 1), "plan_p90_m": round(float(np.percentile(D, 90)), 1), "plan_max_m": round(float(D.max()), 1),
        "straight_median_m": round(float(np.median(S)), 1), "straight_p90_m": round(float(np.percentile(S, 90)), 1), "straight_max_m": round(float(S.max()), 1),
        "plan_within_25m": round(float((D <= 25).mean()), 3), "straight_within_25m": round(float((S <= 25).mean()), 3),
        "gt15": {k: round(float((v["slope"] > 15).mean()), 4) for k, v in P.items()},
        "gt25": {k: round(float((v["slope"] > 25).mean()), 4) for k, v in P.items()},
        "max_slope": {k: round(float(v["slope"].max()), 1) for k, v in P.items()},
        "mean_hazard": {k: round(float(v["hazard"].mean()), 3) for k, v in P.items()},
        "hazard_gt05": {k: round(float((v["hazard"] > 0.5).mean()), 4) for k, v in P.items()},
        "straight_stretches_over_25deg": sum(1 for r in ok if r["straight_max_slope"] > 25),
        "length_ratio_median": round(float(np.median([r["plan_m"] / r["rover_m"] for r in ok])), 2),
        "plan_length_total_m": round(float(sum(r["plan_m"] for r in ok)), 1),
    }
    return rover, summary, rows


def main():
    pl = Planner()
    rover, s, rows = run(pl, use_hazard=True)
    _, s0, rows0 = run(pl, use_hazard=False)
    area = {"gt15": round(float((pl.slope > 15).mean()), 4), "gt25": round(float((pl.slope > 25).mean()), 4),
            "mean_hazard": round(float(pl.hazard.mean()), 3), "hazard_gt05": round(float((pl.hazard > 0.5).mean()), 4)}
    created = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = ROOT / "model" / "out"; out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").write_text(json.dumps({"planner": MODEL_VERSION, "hazard_source": pl.hazard_source, "created_at": created,
                                                  "summary": s, "summary_without_hazard": s0, "whole_area": area,
                                                  "stretches": rows, "stretches_without_hazard": rows0}, indent=1))
    pct = lambda v: f"{100 * v:.1f}%"
    md = f"""# Proof vs Perseverance (AI hazard planner, {MODEL_VERSION})

Perseverance's real track in the walking area (sols 405–717, {rover["total_length_m"] / 1000:.2f} km) is cut into {s['stretches']} stretches of about {LEG_M:g} m. For each stretch our planner (terrain cost plus the AI hazard layer, weight {s['hazard_weight']:g}) plans a route between the rover's real start and end, and we compare it with the rover's track and with a straight line between the same points. A rover is not an astronaut: this checks our terrain and hazard model, not astronaut safety.

| Measure | Our planner | Straight line | Perseverance |
|---|---|---|---|
| Distance from rover track, median | {s['plan_median_m']} m | {s['straight_median_m']} m | 0 m |
| Distance from rover track, 90th percentile | {s['plan_p90_m']} m | {s['straight_p90_m']} m | 0 m |
| Points within 25 m of rover track | {pct(s['plan_within_25m'])} | {pct(s['straight_within_25m'])} | 100% |
| Ground steeper than 15° | {pct(s['gt15']['plan'])} | {pct(s['gt15']['straight'])} | {pct(s['gt15']['rover'])} |
| Ground steeper than 25° | {pct(s['gt25']['plan'])} | {pct(s['gt25']['straight'])} | {pct(s['gt25']['rover'])} |
| Steepest ground | {s['max_slope']['plan']}° | {s['max_slope']['straight']}° | {s['max_slope']['rover']}° |
| AI hazard under the line, mean (0 to 1) | {s['mean_hazard']['plan']:.3f} | {s['mean_hazard']['straight']:.3f} | {s['mean_hazard']['rover']:.3f} |
| Ground with AI hazard over 0.5 | {pct(s['hazard_gt05']['plan'])} | {pct(s['hazard_gt05']['straight'])} | {pct(s['hazard_gt05']['rover'])} |

Whole walking area: {pct(area['gt15'])} of ground is steeper than 15°, {pct(area['gt25'])} steeper than 25° (our walking limit); mean AI hazard {area['mean_hazard']:.3f}, {pct(area['hazard_gt05'])} of ground has AI hazard over 0.5. Planned length / rover length (median): {s['length_ratio_median']}. Straight lines cross ground steeper than 25° in {s['straight_stretches_over_25deg']} of {s['stretches']} stretches.

Same stretches planned without the AI hazard layer (weight 0): median distance from the rover track {s0['plan_median_m']} m, mean AI hazard under the route {s0['mean_hazard']['plan']:.3f}, ground with AI hazard over 0.5 {pct(s0['hazard_gt05']['plan'])}, total planned length {s0['plan_length_total_m']:.0f} m (with the layer: {s['plan_length_total_m']:.0f} m).

The AI hazard layer is HazardNet (model/MODEL_CARD.md): it reads the HiRISE photo and was never trained on the walking area. The rover drivers did not use it, so low hazard under the rover's track is a sanity check, not proof. Slope is from the 2 m grid built from the USGS Mars 2020 HiRISE DTM; the rover track is NASA/JPL-Caltech M20_traverse.json. Per-stretch numbers: model/out/results.json. Made by model/proof.py.
"""
    (out / "results.md").write_text(md, encoding="utf-8")
    print(md)


if __name__ == "__main__":
    main()
