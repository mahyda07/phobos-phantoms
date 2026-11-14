# Written with AI assistance (Claude).
"""Frame jezero-local-v1 helpers (Python). The ONLY place these conversions live in Python.

local  : x metres east of the NW corner, y metres north (negative going south), z elevation (m)
eqc    : projection metres of the USGS DTM (Equirectangular, Mars sphere radius R from grid.json)
grid   : row (0 = north edge), col (0 = west edge), cell size grid["cell_m"]
lonlat : planetocentric degrees, east longitude
three  : Three.js (x, z - z_ref, -y): Y up, -Z north
leaflet: L.CRS.Simple [lat, lng] with overlay bounds [[0,0],[height,width]] in cells
Spec: contracts/frame.md
"""
import json, math, re, pathlib

_R_PATTERNS = [r'(?:SPHEROID|ELLIPSOID)\["[^"]*",\s*([0-9.eE+]+)', r'\+R=([0-9.eE+]+)']


def radius_from_projection(text: str) -> float:
    for pat in _R_PATTERNS:
        m = re.search(pat, text)
        if m:
            return float(m.group(1))
    raise ValueError("Mars radius not found in projection_wkt (expected SPHEROID[...] or +R=)")


class Frame:
    def __init__(self, grid: dict):
        self.grid = grid
        self.x0, self.y0 = grid["origin_eqc"]
        self.cell = float(grid["cell_m"])
        self.width, self.height = grid["width"], grid["height"]
        self.z_ref = float(grid["z_ref"])
        self.R = radius_from_projection(grid["projection_wkt"])

    @classmethod
    def load(cls, path="terrain/out/grid.json"):
        return cls(json.loads(pathlib.Path(path).read_text()))

    # local <-> eqc
    def local_to_eqc(self, x, y): return self.x0 + x, self.y0 + y
    def eqc_to_local(self, xe, ye): return xe - self.x0, ye - self.y0

    # eqc <-> lon/lat (degrees)
    def eqc_to_lonlat(self, xe, ye): return math.degrees(xe / self.R), math.degrees(ye / self.R)
    def lonlat_to_eqc(self, lon, lat): return self.R * math.radians(lon), self.R * math.radians(lat)

    # local <-> lon/lat
    def local_to_lonlat(self, x, y): return self.eqc_to_lonlat(*self.local_to_eqc(x, y))
    def lonlat_to_local(self, lon, lat): return self.eqc_to_local(*self.lonlat_to_eqc(lon, lat))

    # local <-> grid (fractional row/col; use int() / round() yourself when indexing)
    def local_to_grid(self, x, y): return -y / self.cell, x / self.cell          # (row, col)
    def grid_to_local(self, row, col): return col * self.cell, -row * self.cell  # (x, y)

    # display / headset
    def local_to_three(self, x, y, z): return x, z - self.z_ref, -y
    def local_to_leaflet(self, x, y): return self.height + y / self.cell, x / self.cell  # [lat, lng]

    def inside(self, x, y):
        r, c = self.local_to_grid(x, y)
        return 0 <= r < self.height and 0 <= c < self.width
