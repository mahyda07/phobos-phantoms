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

The cost of one grid square is 1 + a·(slope/limit)² + b·roughness + c·hazard − d·science. Squares above the slope limit or with no data are blocked.
