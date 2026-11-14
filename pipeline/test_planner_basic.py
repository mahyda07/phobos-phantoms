# Written with AI assistance (Claude).
"""Stand-in planner tests on a tiny fake grid (no real data needed)."""
import json
import numpy as np
import pytest
from pipeline.planner_basic import Planner, SLOPE_LIMIT


def make_grid(tmp_path, n=50):
    slope = np.full((n, n), 2.0, "<f4")
    slope[:, 25] = SLOPE_LIMIT + 10       # a wall of cliff down column 25 ...
    slope[40, 25] = 2.0                   # ... with one gap at row 40
    for name, arr in {"dem": np.zeros((n, n), "<f4"), "slope": slope, "rough": np.zeros((n, n), "<f4")}.items():
        arr.astype("<f4").tofile(tmp_path / f"{name}.bin")
    (tmp_path / "grid.json").write_text(json.dumps({"width": n, "height": n, "cell_m": 2}))
    (tmp_path / "stops.csv").write_text("id,name,location_note,lat,lon_e,row,col,reason,science_value,source\n"
                                        "S1,stop one,,0,0,10,45,test,0.5,test\n")
    return Planner(tmp_path)


def test_routes_through_the_gap(tmp_path):
    p = make_grid(tmp_path)
    r = p.plan([11, -11], [11, -11], ["S1"])     # start west of the wall, stop east of it
    cells = [(int(-y // 2), int(x // 2)) for x, y, _ in r["geometry"]["coordinates"]]
    crossings = [rc for rc in cells if rc[1] == 25]
    assert crossings and all(rc[0] == 40 for rc in crossings)
    pv = r["properties"]["per_vertex"]
    assert len(pv["t_min"]) == len(pv["margin_min"]) == len(r["geometry"]["coordinates"])
    assert pv["t_min"] == sorted(pv["t_min"])     # time only goes forward


def test_blocked_start_is_a_clear_error(tmp_path):
    p = make_grid(tmp_path)
    with pytest.raises(ValueError, match="blocked"):
        p.plan([51, -11], [11, -11], [])          # x=51 m -> column 25 (the wall)


def test_unknown_stop(tmp_path):
    p = make_grid(tmp_path)
    with pytest.raises(ValueError, match="unknown stop"):
        p.plan([11, -11], [11, -11], ["S9"])


def test_cache_is_capped_and_stops_are_kept():
    pl = Planner()
    pl.warm_up()
    stops_cached = len(pl._cache)
    for i in range(Planner.MAX_RECENT + 4):
        pl.plan([300 + 20 * i, -1000], [1200, -400], ["S1"])
    assert len(pl._recent) <= Planner.MAX_RECENT
    assert len(pl._cache) <= stops_cached + Planner.MAX_RECENT
