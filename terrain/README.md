# terrain

**Owner:** Ramish (terrain and map data track, commits tagged [P2])

**What goes here:** the real map layers for the walking area (PLAN.md D16, D19), all on the shared 2 m grid.

## Build
```
uv run python terrain/build_terrain.py
```
Defaults: DTM `F:/SpaceApps2026/data/terrain/JEZ_TRN_DTM_1m.tif`, photo streamed from USGS, rover files in `F:/SpaceApps2026/data/rover/`. Big files (`photo_25cm.tif`, `dem_2m.tif`) go to `F:/SpaceApps2026/data/terrain/` and the shared drive, never git. `--skip-photo` skips the slow photo step.

## Outputs in `terrain/out/` (750 × 750 cells, 2 m; `.bin` = float32 little-endian, row-major from the NW corner)
| File | What |
|---|---|
| `grid.json`, `terrain.meta.json`, `layers.manifest.json` | grid definition, terrain metadata (with LODs), every layer's source + licence |
| `dem.bin`, `dem_lod512.bin`, `dem_lod256.bin` | elevation (m); headset LODs 512 and 256 |
| `slope.bin` | slope (degrees), Horn (1981) method on the 2 m DEM (same as `gdaldem slope`) |
| `rough.bin` | roughness (m): largest elevation difference in the 3×3 window (same as `gdaldem roughness`) |
| `photo.png`, `dem.png`, `slope.png`, `rough.png` | map images, 750 × 750, north at the top |
| `rover_path.json` | Perseverance's real path inside the area, local metres, with sol per piece |
| `rover_waypoints.csv` | rover stops inside the area with row/col and the rover's own tilt/pitch/roll |

`hazard.bin` (Maryam's AI model) and `science.bin` (from Mahida's CRISM maps) are added later on the same grid.

Only the owner pushes to this folder. Need a change? Ask the owner in the group.
