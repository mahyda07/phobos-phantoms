# samples

**Owner:** Ramish (commits tagged [P5])

**What goes here:** Fake test files in our real formats, every value marked SAMPLE. Everyone builds on these until the real data arrives.

Only the owner pushes to this folder. Need a change? Ask the owner in the group.

## Files (all SYNTHETIC, marked SAMPLE — not NASA data)
`samples/out/` holds a 256 × 256 fake grid at 2 m in our real formats:
`grid.json`, `terrain.meta.json`, `dem.bin` (+ `dem_lod1.bin`), `slope.bin`, `rough.bin`, `hazard.bin`, `science.bin`, PNG previews of each, `hazard.meta.json`, `route.json` (with `per_vertex`), `window.json`, `stops.csv`, `conditions.csv`.
`.bin` = float32 little-endian, row-major, starting at the north-west corner.
Rebuild: `uv run python samples/make_samples.py`. All JSON validates against `contracts/`.
