# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Tests for the AI and safety model track. No GPU and no big data needed; file checks run only if the file exists."""
import json, pathlib

import numpy as np
import pytest
from jsonschema import Draft202012Validator

from model.maryam import route as m_route
from model.maryam import score as m_score
from model.maryam import time_window as m_tw

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "model" / "out"


def schema(name):
    return Draft202012Validator(json.loads((ROOT / "contracts" / f"{name}.schema.json").read_text()))


# ---------- Maryam's code
def test_score_example_from_her_file():
    slope = np.array([[2.0, 12.0], [20.0, 30.0]]); rough = np.array([[0.1, 0.2], [0.5, 2.0]])
    s = m_score.safety_score(slope, rough)
    assert np.allclose(s, [[1.0, 13 / 15], [1 / 3, 0.0]])
    assert m_score.category(s).tolist() == [["go", "go"], ["avoid", "avoid"]]
    assert m_score.passable(s).tolist() == [[True, True], [True, False]]


def test_score_worst_factor_decides():
    assert m_score.safety_score(0.0, 5.0) == 0.0 and m_score.safety_score(40.0, 0.0) == 0.0
    assert m_score.safety_score(10.0, 0.3) == 1.0


def test_time_window_example_from_her_file():
    sun = [2, 10, 18, 26, 33, 38, 40, 38, 33, 26, 18, 10, 2]
    dust = [0.5, 0.5, 0.6, 1.5, 1.5, 0.6, 0.6, 0.6, 0.7, 0.7, 0.8, 1.1, 1.2]
    fc = [m_tw.HourForecast(6 + i, sun[i], dust[i]) for i in range(len(sun))]
    assert m_tw.good_windows(fc) == [(8, 9), (11, 17)]
    assert m_tw.best_walk(fc, 3) == {"start_hour": 11, "end_hour": 14, "avg_sun_deg": 38.7}
    assert m_tw.best_walk(fc, 8) is None


def test_reference_route_goes_through_the_gap():
    score = np.ones((5, 5)); score[:, 2] = 0.0; score[2, 2] = 1.0
    path = m_route.plan_route(score, (0, 0), (4, 4))
    assert path[0] == (0, 0) and path[-1] == (4, 4) and (2, 2) in path
    wall = np.ones((5, 5)); wall[:, 2] = 0.0
    assert m_route.plan_route(wall, (0, 0), (4, 4)) is None


# ---------- label rule of the AI model = her score rule
def test_training_labels_follow_her_score_rule():
    from model.hazard.prepare_data import classes_from_fields
    rng = np.random.default_rng(0)
    slope = rng.uniform(0, 40, (200, 200)); rough = rng.uniform(0, 2, (200, 200))
    cls = classes_from_fields(slope, rough, np.ones(slope.shape, bool))
    names = np.array(["go", "careful", "avoid"])[cls]
    assert (names == m_score.category(m_score.safety_score(slope, rough))).all()


def test_detrended_roughness_ignores_a_plain_slope():
    from model.hazard.prepare_data import terrain_fields
    yy, xx = np.mgrid[0:80, 0:80].astype(np.float32)
    z = 0.3 * xx                                    # a smooth ramp of about 16.7 degrees, no bumps
    slope, rough, valid = terrain_fields(z, np.ones(z.shape, bool), 5)
    inner = (slice(5, -5), slice(5, -5))
    assert valid.all() and np.allclose(slope[inner], np.degrees(np.arctan(0.3)), atol=0.01)
    assert rough[inner].max() < 1e-3


# ---------- planner with the hazard layer
def make_planner(tmp_path, c_hazard, n=50):
    from model.planner import Planner
    for name in ("dem", "rough"):
        np.zeros((n, n), "<f4").tofile(tmp_path / f"{name}.bin")
    np.full((n, n), 2.0, "<f4").tofile(tmp_path / "slope.bin")
    hz = np.zeros((n, n), "<f4"); hz[10:40, 20:30] = 1.0      # a hazardous patch between start and end
    hz.tofile(tmp_path / "hazard.bin")
    (tmp_path / "grid.json").write_text(json.dumps({"width": n, "height": n, "cell_m": 2}))
    return Planner(tmp_path, c_hazard=c_hazard)


def test_planner_walks_around_hazard(tmp_path):
    p = make_planner(tmp_path, c_hazard=8.0)
    start, end = [11, -51], [89, -51]              # west and east of the patch, same row
    with_h = p.plan(start, end, [], use_hazard=True)["properties"]
    without = p.plan(start, end, [], use_hazard=False)["properties"]
    assert max(without["per_vertex"]["hazard"]) == 1.0          # the straight way crosses the patch
    assert max(with_h["per_vertex"]["hazard"]) == 0.0           # the hazard-aware way goes around it
    assert with_h["length_m"] > without["length_m"]
    assert with_h["model_version"].startswith("ai-hazard") and with_h["cost_weights"]["w_h"] == 8.0
    assert without["cost_weights"]["w_h"] == 0.0
    assert not list(schema("route").iter_errors({"type": "Feature", **{k: p.plan(start, end, [])[k] for k in ("geometry", "properties")}}))


def test_planner_rejects_bad_hazard_file(tmp_path):
    from model.planner import Planner
    make_planner(tmp_path, 1.0)
    np.full((50, 50), 2.0, "<f4").tofile(tmp_path / "hazard.bin")
    with pytest.raises(ValueError, match="0..1"):
        Planner(tmp_path)


# ---------- published files (checked when present)
def test_hazard_layer_file():
    f = OUT / "hazard.bin"
    if not f.exists(): pytest.skip("model/out/hazard.bin not built yet")
    grid = json.loads((ROOT / "terrain/out/grid.json").read_text())
    h = np.fromfile(f, "<f4")
    assert h.size == grid["width"] * grid["height"] and np.isfinite(h).all() and h.min() >= 0 and h.max() <= 1
    meta = json.loads((OUT / "hazard.meta.json").read_text())
    assert not list(schema("hazard.meta").iter_errors(meta))
    assert set(meta["hazard_groups"]) == set(meta["classes"]) and meta["cell_m"] == grid["cell_m"]
    ev = json.loads((OUT / "eval.json").read_text())
    assert meta["metrics"]["miou"] == ev["hazardnet"]["test"]["miou"] and meta["checkpoint_sha256"] == ev["checkpoint_sha256"]
    c = np.fromfile(OUT / "hazard_classes.bin", np.uint8)
    assert c.size == h.size and c.max() < len(meta["classes"])


@pytest.mark.parametrize("name,file", [("window", "window.json"), ("route", "route.json")])
def test_published_json_follows_contract(name, file):
    f = OUT / file
    if not f.exists(): pytest.skip(f"model/out/{file} not built yet")
    assert not list(schema(name).iter_errors(json.loads(f.read_text())))


def test_hazard_weight_is_the_one_the_sweep_selected():
    f = OUT / "hazard_weight_sweep.json"
    if not f.exists(): pytest.skip("sweep not run yet")
    from model.planner import C_HAZARD
    assert C_HAZARD == json.loads(f.read_text())["selected_weight"]


def test_window_uses_her_rule():
    from model.window import build
    win, windows, best = build()
    assert not list(schema("window").iter_errors(win))
    s, e = int(win["eva_window"]["start_ltst"]), int(win["eva_window"]["end_ltst"])
    assert all(win["sun_elev_deg"][h] >= m_tw.MIN_SUN_ELEVATION_DEG for h in range(s, e))
    assert any(a <= s and e <= b for a, b in windows)
