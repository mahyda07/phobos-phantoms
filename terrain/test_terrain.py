# Written with AI assistance (Claude).
"""Checks for the slope and roughness maths in build_terrain.py (no data files needed)."""
import math
import numpy as np
from terrain.build_terrain import horn_slope, roughness


def test_horn_slope_on_tilted_plane():
    yy, xx = np.mgrid[0:20, 0:20].astype(float)
    z = math.tan(math.radians(10)) * xx * 2.0          # 10 degree tilt, 2 m cells
    s = horn_slope(z, 2.0)
    assert abs(s[5:15, 5:15].mean() - 10.0) < 1e-6


def test_roughness_is_window_range():
    z = np.zeros((5, 5)); z[2, 2] = 3.0
    r = roughness(z)
    assert r[2, 2] == 3.0 and r[1, 1] == 3.0 and r[0, 0] == 0.0
