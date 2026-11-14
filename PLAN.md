# PLAN.md — single source of truth

Phobos Phantoms OG 7.66 · NASA Space Apps 2026 · "Interplanetary Survival Guide: Martian Map"
Registered: **Islamabad local event (virtual)**. Deadline **Sun 15 Nov 23:59 PKT**; we submit at **20:00**.
Owner of this file: Ramish. Changes go through a Pull Request. Last updated: Sat 14 Nov, PKT.

If this file disagrees with any other doc (TASKS.md, CLAUDE.md, briefs, WhatsApp), **this file wins**.

## 1. What we're building
A mixed-reality Marswalk planner. Real NASA terrain at Jezero Crater becomes a safety map. An AI-scored safest walking route that reaches the science stops is checked against Perseverance's real path. Shown on a web map and as a hologram on a desk in a Meta Quest 3 that you can step into.

## 2. Decisions
| # | Decision | Status | Owner |
|---|---|---|---|
| D1 | Headset: mixed reality is the centrepiece (tested: 85–90 fps at 512 mesh, no real-time shadows, snap-rotate buttons) | ✅ | Ramish |
| D2 | AI: hazard map from orbital photos (segmentation model trained on MarTA-Net). No rover driving logs in NASA's official resources; rover path used only for the proof check | ✅ (licences pending, D10) | Maryam |
| D3 | Site: Jezero Crater, western delta front | ✅ | — |
| D4 | Tools: web = Vite + Leaflet; headset = Three.js WebXR; Python = uv + 3.12 + rasterio (no conda, no GDAL command line) | ✅ | — |
| D5 | Repo: mahyda07/phobos-phantoms (Mahida owner, Ramish admin). Shared drive: Ramish's Google Drive, link in WhatsApp only | ✅ | — |
| D6 | File formats: `contracts/` is law. Don't add or rename fields; ask Ramish | ✅ | Ramish |
| D7 | Gate 1 — scope approved | ✅ | Mahida |
| D8 | Science goal: the astronaut looks for rocks formed in ancient water on the Jezero western delta, stopping to photograph and note rock layers. Minerals from NASA CRISM orbital data: carbonate, clay, olivine. Each 2 m square gets a science score 0–1 (more of these minerals = higher). Limit: orbital data shows signs of minerals, not proof | ✅ | Mahida |
| D9 | Safety settings with sources, in `docs/cost-model.md` | ⏳ by 14:00 | Maryam + Mahida |
| D10 | Licences OK: MarTA-Net dataset + model weights | ⏳ | Ramish / Maryam |
| D11 | Event: Islamabad local (virtual); Team Owner + time zone confirmed | ✅ event / ⏳ owner screenshot | Usman |
| D12 | Demo: on camera OK for everyone; format (30 s video or 7 slides) | ✅ camera / ⏳ format | Usman |
| D13 | Award target: Best Use of Technology (backup Best Mission Concept) | ✅ | Mahida |
| D14 | Schedule shift approved (see §4) | ✅ | Mahida |
| D15 | Night shifts: Ramish works late; others ⏳ | ⏳ | Mahida |
| D16 | Walking area 1.5 × 1.5 km, western delta front: NW 18.47254°N 77.39748°E · NE 18.47254°N 77.42279°E · SW 18.44724°N 77.39748°E · SE 18.44724°N 77.42279°E. Projection metres: xmin 4587712, xmax 4589212, ymin 1093454, ymax 1094954 (750 × 750 cells at 2 m). Contains 6.7 km of Perseverance's path, sols 405–717 (delta-front campaign) | ✅ | Ramish |
| D17 | `POST /plan` request: `{"frame":"jezero-local-v1","start":[x,y],"end":[x,y],"stops":["S1",…],"use_hazard":true}` in local metres; reply is a `route.json`. Contract: `contracts/plan.request.schema.json` | ✅ | Ramish |
| D18 | Hosting: **Vercel on Ramish's account** for both the web display and the headset app. Ramish deploys from `main` with the Vercel command line (free Hobby plan has no team members); Kashif tests locally and on the preview links Ramish posts. Planner service on Render (free web service, Singapore, Ramish's account): https://phobos-planner.onrender.com , deployed from the public hosting copy https://github.com/aprettymess/phobos-planner made by `pipeline/render/make_render.ps1` | ✅ | Ramish |
| D19 | Terrain outputs in `terrain/out/` (same names as `samples/out/`): `grid.json`, `terrain.meta.json`, `dem.bin`, `slope.bin`, `rough.bin`, `hazard.bin`, `science.bin`, and PNGs `photo.png`, `photo_2k.jpg` (headset), `slope.png`, `rough.png`, `hazard.png`, `science.png`. All `.bin` = float32 little-endian, row-major from the NW corner. Grid size: read `width`/`height` from `grid.json` (real = 750 × 750) | ✅ | Ramish |
| D20 | Coordinate helpers: `pipeline/frame.py` and `pipeline/frame.js` (tested). Copies: `xr/src/frame.js`, `display/src/frame.js` (Kashif copies it in). Never edit a copy. Leaflet point = `[height + y/2, x/2]`, overlay bounds `[[0,0],[height,width]]` | ✅ | Ramish |
| D21 | Stand-in planner: Ramish writes a basic least-cost planner in `pipeline/` with the same inputs/outputs Maryam's will have, so the planner service and Gate 2 aren't blocked. Swapped for Maryam's `model/` planner as soon as it's in `main` | ✅ | Ramish |
| D22 | Headset app: Vite + Three.js in `xr/`; hologram 0.6 m wide (1:2500), height ×2 default (×1/×4 toggle), 2048 px photo texture `photo_2k.jpg`, snap-rotate buttons. Until a planner route exists it shows Perseverance's real path, labelled as a stand-in | ✅ | Ramish |
| D23 | Display rules (answers to Kashif): a grid cell (row, col) covers [row, row+1) × [col, col+1), centre at +0.5; pixel lookups floor + clamp. A route is SAMPLE if `plan_id` or `model_version` contains "SAMPLE"; stand-in routes have `model_version` starting "standin-". Display and headset copy their data into `public/data/` at build time (not committed) | ✅ | Ramish |
| D24 | Stops on the grid: `terrain/out/stops.csv` (Mahida's `science/stops.csv` + row/col). Science layer `terrain/out/science.bin` = mean of carbonate, clay, olivine relative signals (CRISM browse products, ~18 m, nearest-neighbour). Clay signal is ~0 in this area | ✅ | Ramish |
| D25 | Stand-in planner live: `pipeline/planner_basic.py` + service `pipeline/api.py`; demo/fallback route `pipeline/fallback/route.json` (4.3 km, 5 stops, min margin 138 min, all ASSUMPTION settings). Service host: see changelog | ✅ | Ramish |
| D26 | Step-in walk + visor in the headset (`xr/`): "Step in" shows the terrain at 1:1 with the route as a ground ribbon and the stops as beacons; simulated walk along `per_vertex.t_min` (10×/30×/60×); visor = Kashif's design v1 (6 fields straight from `route.json` `per_vertex`, sun height from `window.json`, neutral white until thresholds are in `docs/cost-model.md`). Next stop = first stop whose nearest route point comes after the current point; LTST = `eva_window.start_ltst` + time out in Mars hours. | ✅ | Ramish |
| D27 | Stand-ins until the planner team publishes (same files, marked stand-in): `pipeline/window_basic.py` → `pipeline/fallback/window.json` (sun from NASA GISS Mars24 for Jezero on sol 500, temperature/pressure from `science/conditions.csv`, EVA window = longest run of hours with sun ≥ 30° and air ≥ −40 °C → LTST 11–15); `pipeline/proof_basic.py` → `results.md` + `pipeline/fallback/results.json` (Perseverance's track cut into 500 m stretches; planner vs straight line vs rover: distance to rover track and steep-ground share). `model/out/*` always wins. Service: `GET /window` falls back to the stand-in, new `GET /results`. Stop `science_value` (Mahida) is a 3 × 3 CRISM-pixel (~54 m) mean; `science.bin` is per 2 m cell, so they differ slightly by design. | ✅ | Ramish |
| D28 | AI layer wired in everywhere: Maryam's HazardNet (U-Net on the USGS HiRISE 25 cm photo; labels from her go/careful/avoid rule on the 1 m DTM; walking area held out) gives `hazard` 0–1 per 2 m cell = 0.5·P(careful) + 1.0·P(avoid). Held-out test mIoU 0.465 vs baselines 0.287 / 0.291 (`model/out/hazard.meta.json`). Planner `model/planner.py` (ai-hazard-v1) adds 4.0 × hazard to the cell cost (weight from `model/sweep_hazard_weight.py`); the AI layer **adds cost, never blocks** (blocking stays slope > 25° from the DTM). Demo route 4383.4 m, margin 136.1 min, max slope 22.3°, mean AI hazard 0.034 (`model/out/route.json`). Wording everywhere: "AI hazard estimate (model, not validated)". `terrain/sync_hazard.py` copies the layer into `terrain/out/` (+ manifest entry) for the web map; `pipeline/fallback/route.json` is the AI demo route (`pipeline/make_fallback_route.py`); the Render copy stages `model/planner.py` + `model/out` files and runs the AI planner when env `PLANNER=model` is set. | ✅ | Maryam (model), Ramish (wiring) |
| D29 | Time-window tie-break: Maryam's rule (sun ≥ 15°, dust ≤ 1.0, best 4 h by average sun) ties exactly on sol 500: LTST 10–14 and 11–15 both average 42.8° sun. Tie-break: the warmer block wins → **EVA LTST 11–15** (mean air −33.6 °C vs −37.3 °C, coldest hour −39.8 vs −44.0 °C, `science/conditions.csv`). In `model/window.py`; her `maryam/time_window.py` unchanged. | ✅ | Ramish (approved), Maryam's rule |


## 3. Who waits on whom
1. Rover path file (Mahida) → walking area (Ramish, 14:15)
2. Walking area → CRISM coverage + final science stops `stops.csv` (Mahida, 14:45)
3. Walking area + stops → real terrain layers + `grid.json` (Ramish, ~16:00) → Maryam's planner, Kashif's map, headset. Coordinate helpers (D20) are already in the repo
4. `docs/cost-model.md` settings (Maryam + Mahida) → planner
5. First real route `route.json` (Maryam, ~17:30) → Kashif's route view, headset route, planner service
6. Orthophoto on the grid (Ramish) + trained model (Maryam) → hazard map (`hazard.bin`)
7. `conditions.csv` (Mahida, 18:00) → time window `window.json` (Maryam)
8. Visor design (Kashif, 18:00) → headset visor display (Ramish)
9. Rover path on the grid (Ramish) → proof numbers `results.md` (Maryam, tonight)
10. `results.md`, screenshots, `SOURCES.md`, `AI_USAGE.md` (everyone) → submission (Usman, Sunday)

**Rule:** anything more than 1 hour late → the person waiting continues on `samples/out/` and posts in the group.

## 4. Timeline (PKT)
| When | What | Who |
|---|---|---|
| Sat 14:15 | Walking area posted (4 corners) | Ramish |
| Sat 14:45 | Final science stops `stops.csv` | Mahida |
| Sat ~16:00 | Real terrain layers + `grid.json` | Ramish |
| Sat ~19:00 | Planner service URL (Render) for Kashif | Ramish |
| Sat ~17:30 | First real route | Maryam |
| Sat 18:00 | `conditions.csv`; visor design | Mahida; Kashif |
| Sat 21:00 | **Gate 2:** web route + panels + hologram on desk from public links | Mahida approves |
| Night | AI hazard term, proof numbers, step-in walk + visor | Maryam, Ramish |
| Sun 12:00 | **Gate 3: feature freeze**, tag `v1.0` | Mahida approves |
| Sun 12:00–16:00 | Record demo (Ramish drives headset) | Ramish, Usman |
| Sun 16:00–19:00 | Edit video, write project page; everyone sends screenshots + sources | Usman |
| Sun ~19:30 | Repo made public after secrets check | Ramish, Mahida |
| Sun 20:00 | **Gate 4 + submit** | Mahida approves, Usman submits |

Check-ins in the group: 13:00, 19:00, 01:00 — done / next / blocked.

## 5. Changelog
- Sun ~03:30: AI layer wired in everywhere (D28): hazard layer in `terrain/out/` + manifest, AI fallback route, Render copy stages the AI planner (`PLANNER=model`), `/health` shows the hazard layer. Time window tie-break → EVA LTST 11–15 (D29). PRs #26, #27, #28.
- Sat ~21:45: planner service moved to Render (https://phobos-planner.onrender.com): Hugging Face's free plan now only offers ZeroGPU for Gradio/Docker Spaces (CPU basic needs PRO) and the ZeroGPU start-up check kept failing. Render deploys a public hosting copy (aprettymess/phobos-planner) because it can't read the private team repo. `pipeline/hf/` removed; `pipeline/render/make_render.ps1` added.
- Sat ~21:00: headset step-in walk + visor (D26); stand-in time window + proof vs Perseverance (D27); planner service on Hugging Face Spaces (Gradio SDK on ZeroGPU: Docker Spaces are paid, CPU basic not offered; Render can't read the private repo), files in `pipeline/hf/`; Vercel deploys run from `F:\SpaceApps2026\deploy\` outside git (Vercel blocks merge commits by the GitHub no-reply author); SOURCES.md completed (licences, DOIs, Mars24, hosting).
- Sat ~16:30: science layer + stops on grid (D24); stand-in planner + service with demo route (D25).
- Sat: real terrain merged (terrain/out). Headset app + stand-in planner decided (D21, D22).
- Sat: POST /plan contract, Vercel hosting, terrain file names and coordinate helpers decided (D17–D20).
- Sat: walking area chosen from NASA's M20_traverse.json (most rover path of any 1.5 km square in the box). Science goal set.
- Sat: repo scaffold + samples pushed (CI green). Power cut at Ramish's end → schedule shifted (D14). Event is Islamabad local virtual (D11).
