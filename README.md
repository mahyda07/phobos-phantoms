# Phobos Phantoms OG 7.66 · Mixed-reality Marswalk Planner

NASA International Space Apps Challenge 2026 · Challenge: **Interplanetary Survival Guide: Martian Map**

Real NASA terrain at Jezero Crater becomes a safety map. An AI-scored safest route that reaches the science stops is checked against Perseverance's real path. It's shown on a web screen and as a hologram on a desk in a Meta Quest 3 that you can step into.

> Status: built during the hackathon, 14–15 Nov 2026. Work started after kick-off on Sat 14 Nov.

## Try it (public links, no login)
| What | Link | Notes |
|---|---|---|
| Headset app (Meta Quest 3 browser, also runs on a PC) | https://phantom-phobos.vercel.app | Hologram of the walking area on your desk; **Step in** to walk the planned route at full size with the visor |
| Web map | *(display link: added after deploy)* | Route coloured by walk-back margin, science stops with rover photos, proof view, time window |
| Planner web service | https://ramishsaeed-phobos-planner.hf.space | `GET /health`, `GET /stops`, `GET /window`, `GET /results`, `POST /plan`; interactive docs at `/docs` |

## How it works
1. **Terrain** (`terrain/`): USGS Mars 2020 HiRISE elevation (1 m) and photo (25 cm) of a 1.5 × 1.5 km area of Jezero's western delta, turned into a 2 m grid of elevation, slope and roughness.
2. **Science** (`science/`, `terrain/build_science.py`): carbonate, clay and olivine signals from CRISM (MRO) pick five science stops; relative signal strength, not mineral amounts.
3. **Planner** (`pipeline/planner_basic.py`, stand-in until `model/`): least-cost walking route through the stops; slope above 25° is blocked; walking time from Tobler's hiking function; every point carries time out, time back and walk-back margin.
4. **Time window** (`pipeline/window_basic.py`, stand-in): sun height per hour from NASA GISS Mars24 and temperature from Perseverance MEDA pick the EVA hours.
5. **Proof** (`pipeline/proof_basic.py`, stand-in; `results.md`): on Perseverance's real 6.7 km track the planner stays closer to where NASA drove than a straight line, and uses less steep ground than the rover did.
6. **Show it**: web map (`display/`, Leaflet) and mixed-reality headset app (`xr/`, three.js WebXR) read the same files.

Every number on screen comes from a file in this repo; stand-in results are marked "standin" / "STAND-IN".

## Team and folders

Push **only into your own folder**. Nothing goes in the root except the shared files below.

| Folder | Owner | What's in it | Commit tag |
|---|---|---|---|
| `terrain/` | Ramish | Elevation, slope, roughness on the shared 2 m grid | `[P2]` |
| `model/` | Maryam | AI hazard model, route planner, time window, proof vs rover | `[P1]` |
| `display/` | Kashif | Web map screen | `[P3]` |
| `science/` | Mahida (team lead) | Science stops, minerals, radiation, weather | `[P4]` |
| `pipeline/` | Ramish | Planner web service, fallback answers, frame helpers | `[P5]` |
| `xr/` | Ramish | Quest 3 mixed-reality app | `[P5]` |
| `submission/` | Usman | Video script, slides, project page text, screenshots | `[P6]` |
| `samples/` | Ramish | Fake test files in our real formats (marked SAMPLE) | `[P5]` |
| `contracts/` | Ramish | Shared file formats + `validate.py`. **Ask before changing.** | `[P5]` |
| `docs/` | Maryam + Mahida | Planner settings with sources (`cost-model.md`) | `[P1]`/`[P4]` |

Shared root files: `README.md` (Ramish), `AI_USAGE.md` and `SOURCES.md` (everyone appends).

## Rules
1. Work on your **own branch** (e.g. `maryam-planner`), open a Pull Request; Ramish merges. Never push to `main`.
2. Start each commit message with your tag, e.g. `[P4] Add carbonate map from CRISM FRT000047A3`.
3. **Never commit:** passwords, API keys, `.env` files, files over 50 MB, raw downloads, personal info, NASA logos, anyone under 18, any employer or university code.
4. File names: lowercase-with-hyphens, no spaces.
5. Every dataset, model, library or image you use → a row in `SOURCES.md` with its licence.
6. Used any AI tool (ChatGPT, Claude, Copilot, Gemini…)? Add a row to `AI_USAGE.md`. Files with substantial AI-written code start with a comment saying so.
7. Never invent numbers. Missing input → use `samples/`, mark output SAMPLE.
8. Big files (over 50 MB) go to the team shared drive, not here.

## Setup (Python)
Uses [uv](https://docs.astral.sh/uv/) and Python 3.12.
```
uv sync                 # base: geo + service
uv sync --group ai      # adds PyTorch (CUDA 12.8 build) + transformers for the AI model
uv run python contracts/validate.py
```

## Data
All data sources and licences: see [`SOURCES.md`](SOURCES.md).

## Licence
Code: Apache License 2.0 (see `LICENSE`). Data keeps its original licence (see `SOURCES.md`).
