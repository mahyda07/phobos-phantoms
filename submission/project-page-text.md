# Marswalk: Safe-Path Engine
**Team:** Phobos Phantoms OG 7.66  
**Challenge:** Interplanetary Survival Guide: Martian Map — NASA Space Apps Challenge 2026

## One-line summary
An integrated Martian route-planning concept that combines terrain and mission data into a cell-level traversability estimate and a science-aware path for a crew-facing map.

## The problem
Future Mars explorers will need detailed, local information about the ground they cross—not just a planetary map. Elevation, slope, imagery, geology, environmental observations, and science targets can live in separate datasets. This makes it harder to compare route options and understand the trade-offs between a practical path and a scientifically valuable destination.

## Our solution
Marswalk’s Safe-Path Engine is built around one idea: transform relevant map layers into a shared view of traversability. The system aligns available terrain and mission data, assigns each map cell a model-defined traversal cost or class, and uses those costs to plan a route toward selected science stops. The crew-facing interface is designed to show the proposed route alongside hazards and the evidence used to inform it.

## Why Jezero Crater?
Jezero Crater provides a compelling study area because it has been explored by NASA’s Perseverance rover and has terrain products and rover context that can support a grounded demonstration. The final submission should identify the exact map products, spatial coverage, coordinate system, resolution, and licences actually used by the team.

## What makes it useful?
Instead of asking a crew member to mentally combine separate layers, Marswalk aims to make the route decision inspectable in one place: what path is proposed, which cells contribute higher traversal cost, which science stops are included, and what data supports the recommendation. Missing data and uncertainty should remain visible.

## Current status and limitations
Describe only what is implemented in the final repository. Label prototype behavior and SAMPLE outputs clearly. Do not claim calibrated safety probabilities, validated astronaut walking limits, forecast accuracy, or mission readiness unless those claims have been tested and documented. Marswalk is a planning-aid concept, not a certified safety system.

## Future work
Potential next steps include broader validation against comparable rover traverses, improved uncertainty estimates, more complete environmental data integration, and user testing with mission-planning scenarios.

## Credits and data
List each dataset, software library, model, and image in `SOURCES.md` with its source and licence. Disclose AI-assisted work in `AI_USAGE.md` as required by the team README.
