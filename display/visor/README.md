Visor design v2 · for the Quest 3 headset (Ramish builds) · values in the PNG are REAL stand-in planner output

- Design: `visor-design.png` (1600×900), made from `visor-mock.html` (static, no JavaScript).
- Values are copied verbatim from the stand-in planner (`standin-basic-v1`) at route point index 700 (0-based) of 1822:
  - `pipeline/fallback/route.json` `properties.per_vertex` at [700]: margin 163.71 min, time out 40.84 min, slope 5.01°, hazard 0.0 (AI hazard layer not ready, so the stand-in gives 0).
  - Next stop S5 "carbonate-signal spot 5": first stop in `properties.stops` whose x,y matches a route vertex after 700 (vertex 934).
  - Sun 46.1° = `pipeline/fallback/window.json` `sun_elev_deg` at `ltst_hours` = 12 (assumed demo hour inside `eva_window` 11.0–15.0).
- The visor only shows numbers. It never works out time or margin itself; those come straight from `per_vertex`.

## Fields (6)

| Field (as shown) | Source (file + field path) | Unit | Format (display rounding only) | Size / position | Proposed colour |
|---|---|---|---|---|---|
| Walk-back margin | `route.json` `properties.per_vertex.margin_min[i]` | min | Mock shows the raw value. Suggest whole minutes, rounded down (never show more time than there is) | Biggest: digits about 140 px. Top-left panel | green/amber/red once thresholds are published in docs/cost-model.md |
| Time out | `route.json` `properties.per_vertex.t_min[i]` | min | Mock shows the raw value. Suggest whole minutes | Digits about 72 px. Left, under the margin | Neutral white (no colour) |
| Slope here | `route.json` `properties.per_vertex.slope_deg[i]` | degrees | Suggest 1 decimal place | Digits about 72 px. Top-right | green/amber/red once thresholds are published in docs/cost-model.md (slope limit) |
| AI hazard here | `route.json` `properties.per_vertex.hazard[i]` | 0–1 ("of 1") | Suggest 2 decimal places. Always show the subtitle "AI hazard estimate (validated on held-out terrain)" | Digits about 72 px. Right, under the slope | green/amber/red once thresholds are published in docs/cost-model.md |
| Next stop | `route.json` `properties.stops[k].id` + `.name` | — | id + name as written | id about 72 px, name about 52 px. Bottom-left | Neutral white |
| Sun height | `window.json` `sun_elev_deg[h]`, where `ltst_hours[h]` = current LTST hour | degrees | Suggest whole degrees. Subtitle: "at HH:00 LTST · typical sol (climatology), not a forecast" | Digits about 72 px. Bottom-right | green/amber/red once thresholds are published in docs/cost-model.md (minimum sun elevation) |

`i` = current route point. `k` = next stop. `h` = current LTST hour. There are no thresholds yet, so the mock shows every value in neutral white and carries a "colour bands pending" note. The centre of the view (about x 830–1100 at the top, and all of the middle) stays clear.

## Candidates left out

- **Time back** (`properties.time_back_min`): one number for the whole route, not for this point. Walk-back margin already answers "can I get back?" right here.
- **Dust** (`conditions.csv` `dust_tau` at the LTST hour): climatology that barely changes during a walk (barely changes hour to hour), and there is no dust limit yet. Better on the web map's planning view. It is not in `window.json`, so the headset would also need to load a second file.
- **Temperature / pressure / radiation** (`window.json` / `conditions.csv`): climatology the suit handles, nothing the walker acts on. Keeps the visor at 6 fields.
- **Route-wide totals** (`length_m`, `time_out_min`, `properties.margin_min`, `slope_max_deg`): these are for planning, not for "where am I now".

## Open questions for Ramish

1. **Current route point `i`**: how does the headset choose it? Options: the route vertex nearest the walker's position on the hologram, or a simulated walk that steps through the vertices.
2. **Next stop `k`**: how does the headset know which stop comes next? The fallback `route.json` has `properties.legs[]` (START→S1→S3→S5→S2→S4→END, each with `time_min`). In the mock, S5 was chosen because its x,y (569, −177) matches `geometry.coordinates[934]`, the first stop vertex after point 700 (stops match vertices 235, 578, 934, 1101, 1453); the legs agree: t_min 40.84 falls in leg S3→S5 (cumulative 34.6–52.3 min). One option: the next stop is the first stop whose matching vertex is after `i`.
3. **LTST hour `h`** for the sun lookup: does it come from a simulated clock that starts at `eva_window.start_ltst` and adds `t_min`, or from a fixed demo hour? The mock uses 12 as an assumed demo hour.
