# Use of AI

Every AI-assisted change gets one row. This feeds the mandatory "Use of AI" field in the submission.
AI-generated images or video must carry a visible watermark and must not use or alter NASA branding.

| Date (PKT) | Person | Tool | What for | Files |
|---|---|---|---|---|
| 2026-11-14 | Ramish | Claude (Anthropic) | Repo scaffold: folder READMEs, README, .gitignore, pyproject.toml, CI workflow, this file, SOURCES.md template | root files, */README.md, .github/workflows/ci.yml |
| 2026-11-14 | Ramish | Claude (Anthropic) | File-format contracts and validator (drafted 11–13 Nov as design material, copied in after kick-off) | contracts/, docs/cost-model.md |
| 2026-11-14 | Ramish | Claude (Anthropic) | Fake sample files generator and outputs (SAMPLE, synthetic) | samples/make_samples.py, samples/out/ |
| 2026-11-14 | Ramish | Claude (Anthropic) | PLAN.md; POST /plan request contract; frame helpers (Python + JS) with round-trip tests; CI step for JS tests | PLAN.md, contracts/plan.request.*, contracts/frame.md, pipeline/frame.*, pipeline/test_frame.py, xr/src/frame.js, .github/workflows/ci.yml |
| 2026-11-14 | Ramish | Claude (Anthropic) | Terrain build script (DTM crop to 2 m grid, slope, roughness, LODs, photo, rover path) and tests | terrain/build_terrain.py, terrain/test_terrain.py, terrain/README.md, SOURCES.md |
| 2026-11-14 | Ramish | Claude (Anthropic) | Headset texture photo_2k.jpg + reuse local photo in terrain build | terrain/build_terrain.py, terrain/README.md |
| 2026-11-14 | Ramish | Claude (Anthropic) | Headset hologram app (Vite + Three.js WebXR): placement, hands, snap-rotate, layers, route ribbon | xr/ |
| 2026-11-14 | Ramish | Claude (Anthropic) | Science layer and stops on the grid (reproject CRISM layers, score, row/col) | terrain/build_science.py, terrain/README.md |
| 2026-11-14 | Ramish | Claude (Anthropic) | Stand-in planner, planner web service, Dockerfile, demo/fallback route, tests | pipeline/planner_basic.py, pipeline/api.py, pipeline/test_planner_basic.py, pipeline/fallback/, Dockerfile, .dockerignore, PLAN.md |
| 2026-11-14 | Mahida | Claude (Anthropic) | Wrote the mineral, stops, weather and conditions scripts, then I ran and checked them | science/code/check_minerals.py, build_minerals.py, make_stops.py, meda_pressure.py, make_conditions.py |
| 2026-11-14 | Mahida | Claude (Anthropic) | Planning, explaining the data, drafting science-goal.md and the source rows | science/science-goal.md, science/sources.md, SOURCES.md |
| 2026-11-14 | Kashif | Claude (Anthropic, Claude Code) | Web map foundation (Vite + Leaflet, frame.js copy, data copy script, real photo map) and visor design mock + field list for the headset | display/ |
| 2026-11-14 | Kashif | Claude (Anthropic, Claude Code) | Web map route view: route coloured by walk-back margin, stops, hazard pins, side panel, point-by-point readout, time window | display/src/, display/index.html, display/screens/ |
| 2026-11-14 | Kashif | Claude (Anthropic, Claude Code) | Web map: live planner client (POST /plan, 3 s fallback, local mock planner), stop cards with Perseverance photos, proof view vs rover path, integration | display/ |
| 2026-11-14 | Kashif | Claude (Anthropic, Claude Code) | Web map polish: data sources panel + layer legends, moving-map controls (play, follow, distance rings), phone/tablet layout, screenshot script, display README | display/ |
| 2026-11-14 | Kashif | Claude (Anthropic, Claude Code) | Web map for the astronaut: darker distance rings, direction arrow, heads-up strip, hourly conditions from conditions.csv | display/ |
| 2026-11-14 | Kashif | Claude (Anthropic, Claude Code) | Web map: elevation profile along the route (heights and times from route.json), linked to map, slider and heads-up strip | display/src/profile.*, display/src/main.js, display/index.html |
| 2026-11-14 | Ramish | Claude (Anthropic) | Hugging Face Space for the planner service (Gradio entry app with ZeroGPU hook, requirements, Space README, staging script) | pipeline/hf/ |
| 2026-11-14 | Ramish | Claude (Anthropic) | Stand-in time window (Mars24 sun + MEDA conditions), stand-in proof vs Perseverance, /window fallback and /results endpoints, tests; SOURCES.md licences and DOIs; README live links | pipeline/window_basic.py, pipeline/proof_basic.py, pipeline/api.py, pipeline/test_window_proof.py, pipeline/fallback/, results.md, SOURCES.md, README.md |
| 2026-11-14 | Ramish | Claude (Anthropic) | Headset step-in walk + visor (walk logic and tests, visor drawing, 1:1 terrain, walk controls) | xr/ |
| 2026-11-14 | Ramish | Claude (Anthropic) | Planner service hosting moved to Render: staging/push script, PLAN/README/SOURCES updates | pipeline/render/, PLAN.md, README.md, SOURCES.md |
| 2026-11-14 | Ramish | Claude (Anthropic) | Headset page welcome screen, onboarding guide (page and in-headset), toolbar, toasts | xr/index.html, xr/src/ui.css, xr/src/onboarding.js, xr/src/main.js |
| 2026-11-14 | Ramish | Claude (Anthropic) | Web map Marswalk look: welcome screen, guided tour, foldable panel, header (restyle only) | display/src/welcome.js, display/src/theme.css, display/src/main.js |
