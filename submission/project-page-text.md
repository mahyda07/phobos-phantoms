# Marswalk Safe-Path Engine
**Team:** Phobos Phantoms OG 7.66  
**Challenge:** Interplanetary Survival Guide: Martian Map — NASA Space Apps Challenge 2026

## One-line summary
Real NASA terrain of Jezero Crater becomes a safety map: an AI hazard estimate and a least-cost planner give a walking route through five science stops with the time left to walk back at every step, checked against Perseverance's real path and shown on a web map and as a mixed-reality hologram you can step into.

## Try it (no login)
- Headset app (Meta Quest 3 browser, also runs on a PC): https://phantom-phobos.vercel.app
- Web map: https://phobos-display.vercel.app
- Planner web service: https://phobos-planner.onrender.com (interactive docs at `/docs`; free hosting, the first request after a quiet spell is slow)
- Code: https://github.com/mahyda07/phobos-phantoms

## The problem
Future Mars explorers will need detailed, local information about the ground they cross, not just a planetary map. Elevation, slope, imagery, mineral signals and weather live in separate datasets, which makes it hard to see the trade-off between a safe path and a scientifically valuable one, and how much time is left to get back.

## Our solution
1. **Terrain:** USGS Mars 2020 HiRISE elevation (1 m) and photo (25 cm) of a 1.5 × 1.5 km area of Jezero's western delta (18.45–18.47° N, 77.40–77.42° E), turned into a 2 m grid (750 × 750 cells) of elevation, slope and roughness.
2. **Science:** carbonate, clay and olivine signals from CRISM (MRO, product FRT000047A3) pick five science stops. These are relative signals from browse products, not mineral amounts.
3. **AI hazard estimate (validated on held-out terrain):** HazardNet, a U-Net trained from scratch on the HiRISE photo with go / careful / avoid labels computed from the elevation model, scores every 2 m cell. The walking area was held out of training. On held-out test areas it reaches a mean IoU of 0.465, against 0.287 and 0.291 for two simple baselines.
4. **Planner:** least-cost route through the stops. Ground steeper than 25° is blocked; the AI hazard only adds cost (weight 4.0) and never blocks a cell; walking time comes from Tobler's hiking function × 0.6 for a suit in Mars gravity. Every point on the route carries time out, time back and the walk-back margin within a 240-minute EVA. All of these limits are labelled assumptions.
5. **Time window:** sun height per hour (NASA GISS Mars24) and dust and temperature from Perseverance's MEDA instrument give the EVA hours: **11:00–15:00 local solar time** on a typical sol (not a forecast).
6. **Show it:** the web map colours the route by walk-back margin and shows the hazard layer, stops, time window and proof. The headset app puts the area on your desk as a hologram; **Step in** walks the route at full size with a visor showing margin, slope, AI hazard, sun height and the next stop.

7. **Run 2 additions (15 Nov, all live):** in the headset, hold A for a **live return route home** (planner response shown on the visor; offline it reverses the walked path), **voice callouts** for steep ground, AI hazard ahead and stops (Quest Browser has no speech engine, so these are recorded clips), **haptics** on rough ground, and **Perseverance's real path** replayed with the NASA rover model. The web map gains a **3D terrain view** and a full keyboard map. A **data feeds** card shows today's Earth–Mars light delay (10.9 min on 15 Nov 2026, JPL Horizons, `pipeline/feeds/horizons.json`) next to the planning date's 10.1 min, recent Sun activity (measured near Earth) and IAU-named features near the area. Real Mars wind recorded by Perseverance plays as ambience.

## Demo walk (from the repository files)
- 4383.4 m through 5 stops, back to the start
- Smallest walk-back margin: 136.1 min of a 240 min EVA
- Steepest ground on the route: 22.3° (limit 25°)
- Mean AI hazard under the route: 0.034 (0 to 1)

## Checked against Perseverance
Perseverance's real track in the walking area (6.69 km, sols 405–717) was cut into 13 stretches. For each stretch our planner planned between the rover's real start and end:
- Median distance from the rover's track: **16.0 m** for our planner, 20.0 m for a straight line
- Ground with AI hazard over 0.5: **0.6%** for our planner, 2.7% for a straight line, 0.9% for the rover
- Ground steeper than 15°: 1.0% for our planner, 4.0% for a straight line, 1.4% for the rover

A rover is not an astronaut, and the rover drivers did not use our hazard layer, so this checks our terrain and hazard model; it is not proof of astronaut safety.

## Current status and limitations
- Built during the hackathon, 14–15 Nov 2026. Everything above is implemented and live; the hosted planner service switches to the AI planner once its server setting is changed (until then it plans with the no-AI baseline).
- Slope limit, walking speed, EVA length, hazard weight and cost weights are assumptions, not suit or mission limits. Time spent working at the stops is not counted in the walk-back margin.
- The AI hazard layer is a model estimate. Validated on the held-out walking area (`model/hazard/validate_walk.py` → `model/out/validation_walk.json`): mIoU 0.369 against Maryam's go/careful/avoid rule recomputed from the 2 m grid (majority baseline 0.232; a slope-threshold baseline scores 0.388 but slope defines those labels); on Perseverance's real drives (3158 cells) the mean AI hazard is 0.044 vs 0.127 for the whole area, 0.0% of rover cells are 'avoid' vs 3.9%, and 94.8% are 'go' vs 83.3%. This validates the map against terrain data and rover experience, not astronaut walking safety. Its its "careful" and "avoid" classes are much harder for it than "go" (per-class IoU in `model/MODEL_CARD.md`). Its classes are mostly slope classes learned from the photo, so lower AI hazard under our route is expected (the planner is penalised by that layer): a sanity check, not proof.
- The time window is for a typical sol, not a forecast.
- Marswalk is a planning aid concept, not a certified safety system.

## Future work
Validation of the hazard estimate against more rover traverses and field analogues, calibrated uncertainty, real suit and EVA limits from mission planners, live weather instead of a typical sol, and user testing with mission-planning scenarios.

## Credits and data
Every dataset, library, model and image is listed in `SOURCES.md` with its source and licence (USGS HiRISE products CC0 1.0; NASA/JPL-Caltech rover path; CRISM via NASA PDS; MEDA via NASA PDS). AI-assisted work is listed in `AI_USAGE.md`.

Numbers on this page come from `model/out/route.json`, `model/out/window.json`, `model/out/hazard.meta.json`, `model/out/results.md`, `pipeline/planner_basic.py`, `model/planner.py` and `terrain/out/grid.json`.
