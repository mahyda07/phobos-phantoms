# Written with AI assistance (Claude).
"""Rebuild the static fallback route (pipeline/fallback/route.json) with the AI planner (PLAN.md D28). Track [P5].

The fallback is what GET /route/demo serves and what both web apps show when the planner service is asleep.
It is the same demo walk as model/out/route.json: start = pipeline.planner_basic.default_start(), all stops, back to start,
planned by model/planner.py (ai-hazard-v1, AI hazard weight 4.0).
Run from the repo root:  uv run python pipeline/make_fallback_route.py
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from model.planner import Planner, default_start  # noqa: E402

OUT = ROOT / "pipeline/fallback/route.json"


def main():
    pl = Planner()
    s = default_start()
    route = pl.plan(s, s, list(pl.stops))
    OUT.write_text(json.dumps(route))
    p = route["properties"]
    print(f"{OUT.relative_to(ROOT)}: {p['model_version']} | hazard from {pl.hazard_source} | length {p['length_m']} m | "
          f"margin {p['margin_min']} min | max slope {p['slope_max_deg']} deg | mean hazard {p['hazard_mean']} | "
          f"order {' -> '.join(x['id'] for x in p['stops'])}")


if __name__ == "__main__":
    main()
