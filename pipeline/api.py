# Written with AI assistance (Claude).
"""Planner web service (PLAN.md D17, D21). Track [P5].

Endpoints
  GET  /health      -> {"status": "ok", "planner": ..., "model_version": ...}
  GET  /layers      -> terrain/out/layers.manifest.json (every layer with source + licence)
  GET  /stops       -> the science stops on the grid (terrain/out/stops.csv as JSON)
  GET  /route/demo  -> the precomputed demo route (pipeline/fallback/route.json), also the display's fallback
  GET  /window      -> window.json: the planner team's file if published, else the stand-in pipeline/fallback/window.json
  GET  /results     -> proof vs Perseverance: model/out/results.md if published, else the stand-in results.md (text)
  POST /plan        -> body per contracts/plan.request.schema.json, reply is a route.json

Settings (environment variables)
  CORS_ALLOW_ORIGINS  comma-separated list of web pages allowed to call this (default: localhost dev servers)
  PHOBOS_DATA         folder with the grid files (default terrain/out)
  PLANNER             "standin" (default) or "model" (Maryam's planner in model/planner.py, class Planner, same plan())
Run locally:  uv run uvicorn pipeline.api:app --reload --port 8000
"""
import csv, json, os, pathlib

from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = pathlib.Path(os.environ.get("PHOBOS_DATA", ROOT / "terrain/out"))
FALLBACK = ROOT / "pipeline/fallback/route.json"
REQ_SCHEMA = Draft202012Validator(json.loads((ROOT / "contracts/plan.request.schema.json").read_text()))
ROUTE_SCHEMA = Draft202012Validator(json.loads((ROOT / "contracts/route.schema.json").read_text()))

if os.environ.get("PLANNER", "standin") == "model":
    from model.planner import Planner  # Maryam's planner: same constructor + plan(start, end, stop_ids, use_hazard)
    PLANNER_NAME = "model"
else:
    from pipeline.planner_basic import Planner
    PLANNER_NAME = "standin"

planner = Planner(DATA)
app = FastAPI(title="Phobos Phantoms planner", version="0.1")
origins = [o.strip() for o in os.environ.get(
    "CORS_ALLOW_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.on_event("startup")
def warm_up():
    """Pre-compute the stop-to-everywhere cost fields so the first /plan call is fast."""
    try:
        if FALLBACK.exists():
            start = json.loads(FALLBACK.read_text())["geometry"]["coordinates"][0][:2]
            planner.plan(start, start, list(planner.stops))
    except Exception as e:  # warm-up must never stop the service
        print("warm-up skipped:", e)


@app.get("/health")
def health():
    return {"status": "ok", "planner": PLANNER_NAME,
            "model_version": getattr(__import__(planner.__class__.__module__, fromlist=["x"]), "MODEL_VERSION", "unknown"),
            "grid": {"width": planner.grid["width"], "height": planner.grid["height"], "cell_m": planner.grid["cell_m"]},
            "stops": list(planner.stops)}


@app.get("/layers")
def layers():
    return json.loads((DATA / "layers.manifest.json").read_text())


@app.get("/stops")
def stops():
    return list(csv.DictReader(open(DATA / "stops.csv", newline="", encoding="utf-8")))


@app.get("/route/demo")
def route_demo():
    if not FALLBACK.exists():
        raise HTTPException(404, "no demo route yet")
    return json.loads(FALLBACK.read_text())


@app.get("/window")
def window():
    for p in (DATA / "window.json", ROOT / "model/out/window.json", ROOT / "pipeline/fallback/window.json"):
        if p.exists():
            return json.loads(p.read_text())
    raise HTTPException(404, "window.json not published yet")


@app.get("/results", response_class=PlainTextResponse)
def results():
    for p in (ROOT / "model/out/results.md", ROOT / "model/results.md", ROOT / "results.md"):
        if p.exists():
            return p.read_text(encoding="utf-8")
    raise HTTPException(404, "results.md not published yet")


@app.post("/plan")
def plan(body: dict):
    errs = [e.message for e in REQ_SCHEMA.iter_errors(body)]
    if errs:
        raise HTTPException(400, {"error": "bad request", "details": errs})
    try:
        route = planner.plan(body["start"], body["end"], body["stops"], body.get("use_hazard", True))
    except ValueError as e:
        raise HTTPException(422, {"error": str(e)})
    errs = [e.message for e in ROUTE_SCHEMA.iter_errors(route)]
    if errs:
        raise HTTPException(500, {"error": "planner produced an invalid route.json", "details": errs})
    return route
