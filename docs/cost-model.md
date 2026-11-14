# Cost model and settings (Maryam P1 owns; every value needs a source or "assumption")

These are the values the stand-in planner and time window use today (pipeline/planner_basic.py and pipeline/window_basic.py). If Maryam changes a value, the code and this table must change together.

| Setting | Value | Unit | Source or "assumption" | Who set it |
|---|---|---|---|---|
| Slope limit (blocked above) | 25 | degrees | assumption | stand-in planner (Ramish) |
| Weight a (slope) | 4.0 | — | assumption | stand-in planner (Ramish) |
| Weight b (roughness) | 0.5 | — | assumption | stand-in planner (Ramish) |
| Weight c (AI hazard) | 0.0 | — | assumption. Off until the AI hazard layer exists | stand-in planner (Ramish) |
| Weight d (science bonus) | 0.5 | — | assumption | stand-in planner (Ramish) |
| Walking speed formula | Tobler: 6·exp(−3.5·\|tan θ + 0.05\|) | km/h | Tobler (1993), Earth baseline | stand-in planner (Ramish) |
| Mars/suit speed factor k | 0.6 | — | assumption (pressure suit, 0.38 g). No reference yet | stand-in planner (Ramish) |
| Max EVA duration | 240 | min | assumption. No NASA page checked yet | stand-in planner (Ramish) |
| Max walk-back distance | not used | m | The code limits the walk by time: margin = EVA limit − time out − time back | stand-in planner (Ramish) |
| Minimum sun elevation | 30 | degrees | assumption (good light, short shadows) | stand-in time window (Ramish) |
| Dust limit | not used | tau | The stand-in time window ignores dust. For reference, conditions.csv uses dust_tau 0.5 (MEDA, Savijarvi et al. 2024, sols 566-571) | Mahida (reference only) |
| Temperature band | minimum −40 | °C | assumption, not a suit limit. MEDA air temperature measured on sols 500 and 501: −82 to −29 °C (science/conditions.csv) | stand-in time window (Ramish) |
| Weight c (AI hazard) in the AI planner (model/planner.py, ai-hazard-v1) | 4.0 | — | Chosen by model/sweep_hazard_weight.py from 0, 0.5, 1, 2, 4, 8: lowest mean AI hazard along the demo walk among weights that cost at most 10 min of walk-back margin and at most 10% extra length (both limits are assumptions). Effect on the demo walk against weight 0: length 4297.3 to 4383.4 m, minimum margin 138.0 to 136.1 min, mean AI hazard 0.058 to 0.034 (model/out/hazard_weight_sweep.json) | Maryam |
| AI hazard value of a cell | 0.5 × P(careful) + 1.0 × P(avoid) | 0 to 1 | assumption (a careful cell counts half). P = class probability from HazardNet (model/MODEL_CARD.md). The AI layer only raises cost; it never blocks a cell | Maryam |
| Hazard classes: go / careful / avoid | score ≥ 0.7 / ≥ 0.4 / below | — | Maryam's score.py (model/maryam/score.py): score = min(slope score, roughness score); slope ramp 10 to 25 degrees, detrended-roughness ramp 0.3 to 1.5 m. Her starting guesses: assumption | Maryam |
| Hazard groups | go = low, careful = medium, avoid = high | — | assumption | Maryam |
| Minimum sun elevation in the AI track's time window (model/window.py) | 15 | degrees | Maryam's time_window.py: assumption | Maryam |
| Dust limit in the AI track's time window (model/window.py) | 1.0 | tau | Maryam's time_window.py: assumption. conditions.csv has dust_tau 0.5 for every hour | Maryam |
| EVA window length in model/window.py | 4 | hours | The Max EVA duration above (240 min); the window is the 4 hours with the highest average sun inside the good hours. Temperature is used only as a tie-break: on equal average sun (within 0.05 degrees) the warmer block wins. Sol 500: LTST 10-14 and 11-15 tie at 42.8 degrees average sun; 11-15 is warmer (mean air -33.6 vs -37.3 C, coldest hour -39.8 vs -44.0 C, science/conditions.csv), so the window is LTST 11-15 (model/out/window.json) | Maryam (tie-break: Ramish) |

The cost of one grid square is 1 + a·(slope/limit)² + b·roughness + c·hazard − d·science. Squares above the slope limit or with no data are blocked.
