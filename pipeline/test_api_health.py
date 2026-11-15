# Written with AI assistance (Claude).
"""/health reports which planner and hazard layer are in use (PLAN.md D28). Runs each mode in a fresh interpreter."""
import json, os, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
CODE = "import json; from pipeline.api import health; print(json.dumps(health()))"


def _health(planner):
    env = {**os.environ, "PLANNER": planner}
    out = subprocess.run([sys.executable, "-c", CODE], cwd=ROOT, env=env, capture_output=True, text=True, check=True)
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_health_standin_default():
    h = _health("standin")
    assert h["planner"] == "standin" and h["model_version"] == "standin-basic-v1" and "hazard" in h


def test_health_ai_planner():
    h = _health("model")
    assert h["planner"] == "model" and h["model_version"] == "ai-hazard-v1"
    assert h["hazard"].replace("\\", "/").endswith("hazard.bin")


def test_fallback_route_is_the_ai_demo_route():
    fb = json.loads((ROOT / "pipeline/fallback/route.json").read_text())["properties"]
    ai = json.loads((ROOT / "model/out/route.json").read_text())["properties"]
    assert fb["model_version"] == "ai-hazard-v1"
    for k in ("length_m", "margin_min", "slope_max_deg", "hazard_mean"):
        assert fb[k] == ai[k], k


def test_root_points_to_docs():
    code = "import json; from pipeline.api import root; print(json.dumps(root()))"
    out = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True, check=True)
    assert json.loads(out.stdout.strip().splitlines()[-1])["docs"] == "/docs"
