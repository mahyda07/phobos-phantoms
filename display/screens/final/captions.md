# Web map screenshots: captions

Real data set (terrain/out), stand-in route from the pipeline fallback. One line per screenshot.

1. **01-welcome.png** — Welcome screen: what Marswalk is, with route length, stop count, walk-back margin and EVA window read from route.json and window.json (pipeline/fallback).
2. **02-map-route.png** — Full map: HiRISE photo (USGS Mars 2020 TRN orthomosaic) with the route from the stand-in planner (pipeline/fallback/route.json), coloured by walk-back margin, its five science stops, Perseverance's real path, and the route summary in the side panel.
3. **03-walk-along.png** — Walking the route: marker at point 701 of 1822 with distance rings, the heads-up strip under the map and the "At this point" readout; all values are per-point numbers from route.json.
4. **04-stop-cards.png** — Science stop cards S1–S5 with real Perseverance Navcam photos (NASA/JPL-Caltech raw images, picked in src/stop-photos.json); stop names and times from route.json.
5. **05-proof-view.png** — Proof view: planned route against Perseverance's real track (NASA/JPL-Caltech M20_traverse.json) and the results table from results.md (stand-in check made by pipeline/proof_basic.py).
6. **06-elevation-profile.png** — Elevation along the route against walking time, with the stops marked; heights from route.json (USGS HiRISE elevation model).
7. **07-conditions.png** — EVA time window and sun height from window.json (stand-in, pipeline/window_basic.py via pipeline/fallback), plus typical hourly conditions (temperature, pressure, dust, radiation) from science/conditions.csv; climatology, not a forecast.
8. **08-slope-layer.png** — Slope overlay (from the 2 m USGS HiRISE elevation model, terrain/out/slope.png) with its legend and the slope limit from docs/cost-model.md.
9. **09-phone.png** — The same map on a 390 × 844 phone screen.
