# Written with AI assistance (Claude).
"""Round-trip tests for the frame helpers on the real walking area (D16 in PLAN.md)."""
import math
from pipeline.frame import Frame, radius_from_projection

WKT = ('PROJCS["Equirectangular Mars 2000 Sphere IAU",GEOGCS["D_Mars_2000_Sphere",DATUM["Mars_2000_(Sphere)",'
       'SPHEROID["Mars_2000_Sphere_IAU",3396190,0]],PRIMEM["Reference_Meridian",0],UNIT["degree",0.0174532925199433]],'
       'PROJECTION["Equirectangular"],PARAMETER["standard_parallel_1",0],PARAMETER["central_meridian",0],'
       'PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1]]')
GRID = {"frame": "jezero-local-v1", "projection_wkt": WKT, "origin_eqc": [4587712.0, 1094954.0],
        "box_eqc": {"xmin": 4587712.0, "ymin": 1093454.0, "xmax": 4589212.0, "ymax": 1094954.0},
        "cell_m": 2, "width": 750, "height": 750, "z_ref": -2560.0, "nodata": None, "layers_dir": "terrain/out"}
F = Frame(GRID)
POINTS = {"NW corner": (0.0, 0.0), "centre": (750.0, -750.0), "SE corner": (1500.0, -1500.0)}


def test_radius_parsed_not_hardcoded():
    assert radius_from_projection(WKT) == 3396190.0
    assert radius_from_projection("+proj=eqc +R=3396190 +units=m") == 3396190.0


def test_round_trip_lonlat_under_1cm():
    for name, (x, y) in POINTS.items():
        lon, lat = F.local_to_lonlat(x, y)
        x2, y2 = F.lonlat_to_local(lon, lat)
        assert math.hypot(x2 - x, y2 - y) < 0.01, name


def test_round_trip_grid_under_1cm():
    for name, (x, y) in POINTS.items():
        x2, y2 = F.grid_to_local(*F.local_to_grid(x, y))
        assert math.hypot(x2 - x, y2 - y) < 0.01, name


def test_corners_match_plan_latlon():
    lon, lat = F.local_to_lonlat(0, 0)
    assert abs(lat - 18.47254) < 1e-5 and abs(lon - 77.39748) < 1e-5
    lon, lat = F.local_to_lonlat(1500, -1500)
    assert abs(lat - 18.44724) < 1e-5 and abs(lon - 77.42279) < 1e-5


def test_leaflet_north_is_top_and_three_axes():
    assert F.local_to_leaflet(0, 0) == (750, 0)        # NW corner = top-left
    assert F.local_to_leaflet(1500, -1500) == (0, 750)  # SE corner = bottom-right
    assert F.local_to_three(10, -20, -2550) == (10, 10, 20)
