# Proof vs Perseverance (AI hazard planner, ai-hazard-v1)

Perseverance's real track in the walking area (sols 405–717, 6.69 km) is cut into 13 stretches of about 500 m. For each stretch our planner (terrain cost plus the AI hazard layer, weight 4) plans a route between the rover's real start and end, and we compare it with the rover's track and with a straight line between the same points. A rover is not an astronaut: this checks our terrain and hazard model, not astronaut safety.

| Measure | Our planner | Straight line | Perseverance |
|---|---|---|---|
| Distance from rover track, median | 16.0 m | 20.0 m | 0 m |
| Distance from rover track, 90th percentile | 52.8 m | 57.9 m | 0 m |
| Points within 25 m of rover track | 65.6% | 58.8% | 100% |
| Ground steeper than 15° | 1.0% | 4.0% | 1.4% |
| Ground steeper than 25° | 0.0% | 0.0% | 0.0% |
| Steepest ground | 23.9° | 26.4° | 24.6° |
| AI hazard under the line, mean (0 to 1) | 0.026 | 0.062 | 0.048 |
| Ground with AI hazard over 0.5 | 0.6% | 2.7% | 0.9% |

Whole walking area: 10.6% of ground is steeper than 15°, 2.6% steeper than 25° (our walking limit); mean AI hazard 0.127, 8.1% of ground has AI hazard over 0.5. Planned length / rover length (median): 0.85. Straight lines cross ground steeper than 25° in 1 of 13 stretches.

Same stretches planned without the AI hazard layer (weight 0): median distance from the rover track 17.8 m, mean AI hazard under the route 0.035, ground with AI hazard over 0.5 1.1%, total planned length 4923 m (with the layer: 4950 m).

The AI hazard layer is HazardNet (model/MODEL_CARD.md): it reads the HiRISE photo and was never trained on the walking area. The rover drivers did not use it, so low hazard under the rover's track is a sanity check, not proof. Slope is from the 2 m grid built from the USGS Mars 2020 HiRISE DTM; the rover track is NASA/JPL-Caltech M20_traverse.json. Per-stretch numbers: model/out/results.json. Made by model/proof.py.
