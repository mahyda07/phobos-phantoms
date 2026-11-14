---
title: Phobos Planner
emoji: 🛰️
colorFrom: red
colorTo: gray
sdk: gradio
sdk_version: 5.50.0
python_version: "3.12"
app_file: app.py
pinned: false
license: apache-2.0
short_description: Marswalk route planner API for Jezero Crater (Space Apps)
---

# Phobos Planner · Phobos Phantoms OG 7.66

Route planner web service for our NASA Space Apps Challenge 2026 project
("Interplanetary Survival Guide: Martian Map"). It plans a safe Marswalk across a
1.5 × 1.5 km area of Jezero Crater's western delta on a 2 m grid built from NASA HiRISE
terrain, visiting science stops chosen from CRISM mineral maps.

- `GET /health` — status and the loaded science stops
- `GET /stops`, `GET /layers`, `GET /route/demo`, `GET /window` (EVA time window), `GET /results` (proof vs Perseverance)
- `POST /plan` — body `{"frame":"jezero-local-v1","start":[x,y],"end":[x,y],"stops":["S1"],"use_hazard":true}` → route JSON
- `GET /docs` — interactive API page

The current planner is a stand-in (route ids start with `standin-`) until the team's AI planner is merged.
Data credits and licences: see SOURCES.md in the project repository.
