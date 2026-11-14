# display

**Owner:** Kashif (web map track, commits tagged [P3])

**What goes here:** The web map screen (Vite + Leaflet): map, route, hazard markers, side panel, visor panel design, stop cards, proof view. Reads numbers from route.json; never recomputes them.

Only the owner pushes to this folder. Need a change? Ask the owner in the group.

## What the screen shows

- **Map** (left): the HiRISE photo of the Jezero western delta on the `jezero-local-v1` grid. Overlays you can switch on in the layer control (top right): slope, roughness, elevation, AI hazard, science, science stops, Perseverance's real path, planned route. An overlay is only listed if its file is there. Scale bar bottom left, sources in the attribution line bottom right.
- **Planned route**: coloured by walk-back margin at each point (`per_vertex.margin_min`), on a continuous red → amber → green ramp (0 to the largest margin on that route). Hazard pins mark hazards on the route. Drag the slider in the panel to read time out, margin, slope, AI hazard and next stop at any point.
- **Science stops**: cards in the panel with a real Perseverance rover photo per stop. Click a card or a pin to jump between them.
- **Proof view** (button top left): Perseverance's real path next to the planned route, and comparison numbers from `results.md` once it exists.
- **Live planner** ("Plan a route", top left): click a start and an end point, pick stops, and the planner sends back a route. While it works the box says "Planning… (free server, can take a few seconds)". If the planner does not answer within 10 s or fails, the saved route stays on screen and the panel says it is the offline demo route.
- **Side panel** (right; under the map on phones and tablets): route summary, point readout, EVA time window, stops, proof, assumptions.
- **SAMPLE badge**: a red "SAMPLE DATA" badge shows when the grid is synthetic (`SAMPLE` in `grid.json` `projection_wkt` or `source_dtm`) or the route is a sample (`SAMPLE` in `plan_id` or `model_version`). A route whose `model_version` starts with `standin-` gets a yellow "stand-in planner" badge. Rover photos are never shown on sample data.

## Run

```
npm install
npm run dev            # real data set: terrain/out/ (+ route.json etc. from other tracks), http://127.0.0.1:5174/
npm run dev:samples    # sample data set: samples/out/ (synthetic, marked SAMPLE)
```

Both commands copy one whole data set into `public/data/` first. Restart the dev server after switching sets.

## Live planner

The planner address goes in `display/.env.local` (git-ignored, never committed):

```
VITE_PLANNER_URL=<planner address>
```

Restart the dev server after changing it. Without it, the "Plan a route" button falls back to the saved route.

To test without the real planner, run the mock (it answers with `samples/out/route.json`, so use the sample set):

```
npm run mock-planner                                        # terminal 1, http://127.0.0.1:8787
VITE_PLANNER_URL=http://127.0.0.1:8787 npm run dev:samples  # terminal 2
```

`node scripts/mock-planner.mjs --delay 11000` tests the 10 s fallback; `--fail` always answers 500.

## Tests

```
npm test
```

## Build

```
npm run build          # copies the real data set, then builds into dist/
```

Ramish deploys `dist/`.

## Screenshots

`scripts/screenshot.mjs` takes a PNG of a page in headless Firefox (no extra packages). It starts its own Firefox with a temporary profile, takes the shot, quits Firefox and deletes the profile. Start the dev server first.

```
node scripts/screenshot.mjs --url http://127.0.0.1:5174/ --out screens/name.png
node scripts/screenshot.mjs --url http://127.0.0.1:5174/ --out screens/phone.png --width 390 --height 844
node scripts/screenshot.mjs --url http://127.0.0.1:5174/ --out screens/proof.png --click "Proof view" --wait 6000
```

- `--width` / `--height`: viewport size, default 1600 × 900. Firefox windows cannot be narrower than about 450-500 px, so phone sizes are rendered in an exact-size frame; the PNG is still exactly that size.
- `--wait`: ms to wait after loading, default 4000.
- `--click`: text of a button to click before the shot.
- Needs `firefox` on the PATH (or `FIREFOX=/path/to/firefox`). With the Ubuntu snap, the profile lives under `~/snap/firefox/common/` because the snap cannot read `/tmp`.

## Data files

`scripts/copy-data.mjs` empties `public/data/` and copies one set into it. Never edit `public/data/` by hand.

**Sample set** (`--set samples`): every file in `samples/out/`.

**Real set** (default):

| File | Where copy-data looks | Needed? |
|---|---|---|
| `grid.json`, `terrain.meta.json`, `layers.manifest.json` | `terrain/out/` | required |
| `photo.png`, `slope.png`, `rough.png`, `dem.png` | `terrain/out/` | required |
| `rover_path.json`, `rover_waypoints.csv` | `terrain/out/` | required |
| `hazard.png`, `science.png`, `hazard.meta.json` | `terrain/out/` | optional |
| `stops.csv` | `terrain/out/`, then `science/stops.csv` | optional |
| `window.json` | `terrain/out/`, then `model/out/`, then `pipeline/fallback/` | optional |
| `route.json` | `model/out/`, then `pipeline/fallback/` | optional |
| `results.md` | `model/out/`, then `model/`, then the repo root | optional |

The first location that has the file wins. Missing files are listed when the script runs. Also read by the app, from `src/`: `stop-photos.json` (rover photos per stop).

## Rules

- Numbers on screen come only from `route.json` (`properties` and `properties.per_vertex`). The display never works out time, margin, slope or hazard itself.
- `src/frame.js` is an unedited copy of `pipeline/frame.js`. Change it in `pipeline/` and copy it over; never edit it here.
- No thresholds (go / caution / avoid colours) until `docs/cost-model.md` publishes them. Until then the route colour is a continuous ramp.
- Rover photos are credited NASA/JPL-Caltech.

## Visor design

`visor/` has the headset (Quest 3) visor design: `visor-design.png`, the static mock it was made from (`visor-mock.html`), and `visor/README.md` with each field, its source in `route.json` / `window.json`, and open questions for Ramish.

## Marswalk look, welcome and tour (added by Ramish with AI assistance)
- `src/welcome.js` + `src/theme.css` (imported in `src/main.js`, before `responsive.css`): welcome screen with live mission numbers from `data/route.json` and `data/window.json`, a 6-step guided tour (route summary, point readout, play controls, planner, layers, proof), foldable side-panel sections (only Route and "At this point" open at first; opening Proof view on the map opens its section), a brand header with "Guided tour" and "Open in headset", and a `?` button to reopen the welcome.
- Restyle only: no drawing or data code changed, all existing tests unchanged.
