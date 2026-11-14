# Written with AI assistance (Claude).
"""Tests for the stand-in time window (window_basic.py) and proof helpers (proof_basic.py)."""
import datetime, json, math, pathlib, sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import window_basic as W  # noqa: E402
import proof_basic as P   # noqa: E402


def test_mars24_known_values():
    # Mars24 worked example (Allison & McEwen 2000, Appendix): 2000-01-06 00:00 UTC -> Ls 277.18 deg
    ls, _, _, _ = W.mars24(datetime.datetime(2000, 1, 6, tzinfo=datetime.timezone.utc))
    assert abs(ls - 277.19) < 0.1


def test_noon_sun_matches_latitude_and_declination():
    _, dec, _, _ = W.mars24(W.LANDING_UTC + datetime.timedelta(days=W.SOL * W.SOL_DAYS))
    noon = 90 - abs(W.LAT - dec)
    win = json.loads((HERE / "fallback/window.json").read_text())
    assert abs(win["sun_elev_deg"][12] - noon) < 0.2
    assert win["sun_elev_deg"][0] < 0 < win["sun_elev_deg"][12]
    assert win["eva_window"]["start_ltst"] < win["eva_window"]["end_ltst"]


def test_distance_to_line():
    line = [(0.0, 0.0), (10.0, 0.0)]
    d = P.dist_to_line(np.array([[5.0, 3.0], [12.0, 0.0], [-1.0, 0.0]]), line)
    assert np.allclose(d, [3.0, 2.0, 1.0])
    assert math.isclose(P.length([(0, 0), (3, 4), (3, 10)]), 11.0)
