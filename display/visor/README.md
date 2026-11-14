Visor design v1 · for the Quest 3 headset (Ramish builds) · values in the PNG are SAMPLE

- Design: `visor-design.png` (1600×900), made from `visor-mock.html` (static, no JavaScript).
- Sample point: `samples/out/route.json`, route point index 150 (0-based) of 463. Sun value: `samples/out/window.json` at LTST hour 11 (an assumed time inside `eva_window` 10.0–15.0).
- The visor only shows numbers. It never works out time or margin itself; those come straight from `per_vertex`.

## Fields (6)

| Field (as shown) | Source (file + field path) | Unit | Format (display rounding only) | Size / position | Proposed colour |
|---|---|---|---|---|---|
| Walk-back margin | `route.json` `properties.per_vertex.margin_min[i]` | min | Mock shows the raw value. Suggest whole minutes, rounded down (never show more time than there is) | Biggest: digits about 140 px. Top-left panel | green/amber/red once thresholds are published in docs/cost-model.md |
| Time out | `route.json` `properties.per_vertex.t_min[i]` | min | Mock shows the raw value. Suggest whole minutes | Digits about 72 px. Left, under the margin | Neutral white (no colour) |
| Slope here | `route.json` `properties.per_vertex.slope_deg[i]` | degrees | Suggest 1 decimal place | Digits about 72 px. Top-right | green/amber/red once thresholds are published in docs/cost-model.md (slope limit) |
| AI hazard here | `route.json` `properties.per_vertex.hazard[i]` | 0–1 ("of 1") | Suggest 2 decimal places. Always show the subtitle "AI hazard estimate (model, not validated)" | Digits about 72 px. Right, under the slope | green/amber/red once thresholds are published in docs/cost-model.md |
| Next stop | `route.json` `properties.stops[k].id` + `.name` | — | id + name as written | id about 72 px, name about 52 px. Bottom-left | Neutral white |
| Sun height | `window.json` `sun_elev_deg[h]`, where `ltst_hours[h]` = current LTST hour | degrees | Suggest whole degrees. Subtitle: "at HH:00 LTST · typical sol (climatology), not a forecast" | Digits about 72 px. Bottom-right | green/amber/red once thresholds are published in docs/cost-model.md (minimum sun elevation) |

`i` = current route point. `k` = next stop. `h` = current LTST hour. There are no thresholds yet, so the mock shows every value in neutral white and carries a "colour bands pending" note. The centre of the view (about x 830–1100 at the top, and all of the middle) stays clear.

## Candidates left out

- **Time back** (`properties.time_back_min`): one number for the whole route, not for this point. Walk-back margin already answers "can I get back?" right here.
- **Dust** (`conditions.csv` `dust_tau` at the LTST hour): climatology that barely changes during a walk (the sample is 0.5 every hour), and there is no dust limit yet. Better on the web map's planning view. It is not in `window.json`, so the headset would also need to load a second file.
- **Temperature / pressure / radiation** (`window.json` / `conditions.csv`): climatology the suit handles, nothing the walker acts on. Keeps the visor at 6 fields.
- **Route-wide totals** (`length_m`, `time_out_min`, `properties.margin_min`, `slope_max_deg`): these are for planning, not for "where am I now".

## Open questions for Ramish

1. **Current route point `i`**: how does the headset choose it? Options: the route vertex nearest the walker's position on the hologram, or a simulated walk that steps through the vertices.
2. **Next stop `k`**: how does the headset know which stop comes next? `route.json` can carry an optional `legs[]` (`from`/`to`), but the samples have no legs. In the mock, S1 was chosen because its x,y (320, −232) matches `geometry.coordinates[198]`, which comes after point 150 (S2 matches vertex 282). One option: the next stop is the first stop whose matching vertex is after `i`.
3. **LTST hour `h`** for the sun lookup: does it come from a simulated clock that starts at `eva_window.start_ltst` and adds `t_min`, or from a fixed demo hour? The mock uses 11 as an assumed demo hour.
