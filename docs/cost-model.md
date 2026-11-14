# Cost model and settings (Maryam P1 owns; every value needs a source or "assumption")

| Setting | Value | Unit | Source or "assumption" | Who set it |
|---|---|---|---|---|
| Slope limit (blocked above) | | degrees | | |
| Weight a (slope) | | — | assumption | |
| Weight b (roughness) | | — | assumption | |
| Weight c (AI hazard) | | — | assumption | |
| Weight d (science bonus) | | — | assumption | |
| Walking speed formula | Tobler: 6·exp(−3.5·\|tan θ + 0.05\|) | km/h | Tobler (1993), Earth baseline | |
| Mars/suit speed factor k | | — | assumption + reference | |
| Max EVA duration | | min | Lunar EVA ConOps (2020) / Mars DRA 5.0, page … | |
| Max walk-back distance | | m | as above, page … | |
| Minimum sun elevation | | degrees | assumption | |
| Dust limit | | tau | assumption + MEDA reference | |
| Temperature band | | °C | assumption + MEDA reference | |

The cost of one grid square is 1 + a·(slope/limit)² + b·roughness + c·hazard − d·science. Squares above the slope limit or with no data are blocked.
