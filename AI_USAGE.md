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
