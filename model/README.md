# model

**Owner:** Maryam (AI and safety model track, commits tagged [P1])

**What goes here:** AI hazard model, route planner, best time window for the walk, comparison against Perseverance's real path, results.md.

Only the owner pushes to this folder. Need a change? Ask the owner in the group.

## What is here now (AI hazard planner, ai-hazard-v1)

- `MODEL_CARD.md`: what the AI hazard model is, its data, licences, split, results and limits. Read this first.
- `hazard/`: the AI hazard model HazardNet: `prepare_data.py`, `train.py`, `evaluate.py`, `infer.py`, `net.py`, `config.json`, `write_card.py`.
- `maryam/`: Maryam's earlier code with credit lines (walkability score, time-window rule, reference route planner).
- `planner.py`: class `Planner`, same constructor and `plan()` as `pipeline/planner_basic.py`, plus the AI hazard term. Use it in the web service with `PLANNER=model`.
- `sweep_hazard_weight.py`, `proof.py`, `window.py` (Maryam's time-window rule + tie-break: equal average sun -> warmer 4 h block wins; EVA window LTST 11-15), `test_model.py`.
- `out/`: `hazard.bin`, `hazard_classes.bin`, `hazard.png`, `hazard_preview.png`, `hazard.meta.json`, `hazard_stats.json`, `eval.json`, `confusion_matrix.png`, `examples.png`, `training_log.csv`, `hazard_weight_sweep.json`, `route.json`, `results.md`, `results.json`, `window.json`.

The trained weights are not in git (see `MODEL_CARD.md` for the file name and SHA-256). How to rebuild everything: last section of `MODEL_CARD.md`.
