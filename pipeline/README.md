# pipeline

**Owner:** Ramish (pipeline and service track, commits tagged [P5])

| File | What |
|---|---|
| `frame.py`, `frame.js` | the shared coordinate helpers (PLAN.md D20). Copies live in `xr/src/` and `display/src/` |
| `planner_basic.py` | **stand-in** route planner (D21) until Maryam's `model/` planner lands; same `Planner(data_dir).plan(start, end, stop_ids, use_hazard)` |
| `api.py` | planner web service: `GET /health /layers /stops /route/demo /window`, `POST /plan` (D17) |
| `fallback/route.json` | demo route (start on Perseverance's path, all 5 stops, back to start). The display and headset use it when the service is down |

## Run
```
uv run python pipeline/planner_basic.py          # rebuild the demo/fallback route
uv run uvicorn pipeline.api:app --port 8000      # service on http://127.0.0.1:8000  (docs at /docs)
```
Environment: `CORS_ALLOW_ORIGINS` (comma-separated pages allowed to call it), `PLANNER=model` to switch to Maryam's planner.
