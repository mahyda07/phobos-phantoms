# Phobos Phantoms OG 7.66 · Mixed-reality Marswalk Planner

NASA International Space Apps Challenge 2026 · Challenge: **Interplanetary Survival Guide: Martian Map**

Real NASA terrain at Jezero Crater becomes a safety map. An AI-scored safest route that reaches the science stops is checked against Perseverance's real path. It's shown on a web screen and as a hologram on a desk in a Meta Quest 3 that you can step into.

> Status: built during the hackathon, 14–15 Nov 2026. Work started after kick-off on Sat 14 Nov.

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
