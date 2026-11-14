# Proof vs Perseverance (stand-in, standin-basic-v1)

Stand-in check by the pipeline track until the planner team's results are published. Perseverance's real track in the walking area (sols 405–717, 6.69 km) is cut into 13 stretches of about 500 m. For each stretch our planner plans a route between the rover's real start and end, and we compare it with the rover's track and with a straight line between the same points. A rover is not an astronaut: this checks our terrain model, not astronaut safety.

| Measure | Our planner | Straight line | Perseverance |
|---|---|---|---|
| Distance from rover track, median | 17.8 m | 20.0 m | 0 m |
| Distance from rover track, 90th percentile | 53.1 m | 57.9 m | 0 m |
| Points within 25 m of rover track | 63.7% | 58.8% | 100% |
| Ground steeper than 15° | 1.1% | 4.0% | 1.4% |
| Ground steeper than 25° | 0.0% | 0.0% | 0.0% |
| Steepest ground | 21.0° | 26.4° | 24.6° |

Whole walking area: 10.6% of ground is steeper than 15°, 2.6% steeper than 25° (our walking limit). Planned length / rover length (median): 0.84. Straight lines cross ground steeper than 25° in 1 of 13 stretches.

Slope is from the 2 m grid built from the USGS Mars 2020 HiRISE DTM; the rover track is NASA/JPL-Caltech M20_traverse.json. Per-stretch numbers: pipeline/fallback/results.json. Made by pipeline/proof_basic.py.
