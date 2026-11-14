# Frame `jezero-local-v1`

- **Source:** USGS Mars 2020 TRN HiRISE DTM mosaic, 1 m/pixel, equirectangular (Eqc) projection in metres. Its projection text is `projection_wkt` in `grid.json`; R (3396190 m) is read from it by the helpers. Never hard-code R.
- **Origin:** the north-west corner of the site box, in source metres (`origin_eqc = [x0, y0]`). Stored in `grid.json` (`terrain/out/grid.json`).
- **Local axes:**
  - x = metres east of the origin
  - y = metres north of the origin (negative going south, because the origin is the north edge)
  - z = elevation in metres on the DTM datum
- **Grid index:** `col = x / cell_m`, `row = −y / cell_m`. Row 0 is the north edge.

## Conversions (implemented once: `pipeline/frame.py` and `pipeline/frame.js`; copies in `xr/src/` and `display/src/`)
| From → To | Formula |
|---|---|
| local → source Eqc | `x_eqc = x0 + x`, `y_eqc = y0 + y` |
| source Eqc → lon/lat (degrees) | `lon = x_eqc / R × 180/π`, `lat = y_eqc / R × 180/π` |
| local → Three.js | `(x, z − z_ref, −y)` (Y up, −Z north) |
| local → Leaflet `CRS.Simple` | `[height + y / cell_m, x / cell_m]` with overlay bounds `[[0,0],[height,width]]` (north at top) |

## Test points
Three points that must round-trip within 0.01 m:
- the site box's north-west corner
- its centre
- its south-east corner

Walking area (PLAN.md D16), origin_eqc = [4587712, 1094954], 750 × 750 cells:
- NW corner: local (0, 0) = 18.47254°N, 77.39748°E
- centre: local (750, −750)
- SE corner: local (1500, −1500) = 18.44724°N, 77.42279°E

Tests: `pipeline/test_frame.py` (pytest) and `pipeline/frame.test.mjs` (`node --test pipeline/frame.test.mjs`).
