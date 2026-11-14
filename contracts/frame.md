# Frame `jezero-local-v1`

- **Source:** USGS Mars 2020 TRN HiRISE DTM mosaic, 1 m/pixel, equirectangular (Eqc) projection in metres. Copy its exact projection string and sphere radius R from `gdalinfo` into this file on Saturday. Never hard-code R.
- **Origin:** the north-west corner of the site box, in source metres (`origin_eqc = [x0, y0]`). Stored in `contracts/site.json`.
- **Local axes:**
  - x = metres east of the origin
  - y = metres north of the origin (negative going south, because the origin is the north edge)
  - z = elevation in metres on the DTM datum
- **Grid index:** `col = x / cell_m`, `row = −y / cell_m`. Row 0 is the north edge.

## Conversions (implement once, in `frame.py` and `frame.js`)
| From → To | Formula |
|---|---|
| local → source Eqc | `x_eqc = x0 + x`, `y_eqc = y0 + y` |
| source Eqc → lon/lat (degrees) | `lon = x_eqc / R × 180/π`, `lat = y_eqc / R × 180/π` |
| local → Three.js | `(x, z − z_ref, −y)` (Y up, −Z north) |

## Test points
Three points that must round-trip within 0.01 m:
- the site box's north-west corner
- its centre
- its south-east corner

Fill in their values on Saturday from `site.json`.
