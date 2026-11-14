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
| D18 | Hosting: **Vercel on Ramish's account** for both the web display and the headset app. Ramish deploys from `main` with the Vercel command line (free Hobby plan has no team members); Kashif tests locally and on the preview links Ramish posts. Planner service on Render | ✅ | Ramish |
| D19 | Terrain outputs in `terrain/out/` (same names as `samples/out/`): `grid.json`, `terrain.meta.json`, `dem.bin`, `slope.bin`, `rough.bin`, `hazard.bin`, `science.bin`, and PNGs `photo.png`, `slope.png`, `rough.png`, `hazard.png`, `science.png`. All `.bin` = float32 little-endian, row-major from the NW corner. Grid size: read `width`/`height` from `grid.json` (real = 750 × 750) | ✅ | Ramish |
| D20 | Coordinate helpers: `pipeline/frame.py` and `pipeline/frame.js` (tested). Copies: `xr/src/frame.js`, `display/src/frame.js` (Kashif copies it in). Never edit a copy. Leaflet point = `[height + y/2, x/2]`, overlay bounds `[[0,0],[height,width]]` | ✅ | Ramish |


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
- Sat: POST /plan contract, Vercel hosting, terrain file names and coordinate helpers decided (D17–D20).
- Sat: walking area chosen from NASA's M20_traverse.json (most rover path of any 1.5 km square in the box). Science goal set.
- Sat: repo scaffold + samples pushed (CI green). Power cut at Ramish's end → schedule shifted (D14). Event is Islamabad local virtual (D11).
