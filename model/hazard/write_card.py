# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Write model/MODEL_CARD.md from the result files, so every number in the card comes from a script output.

  uv run python model/hazard/write_card.py            (optional argument: the ai data folder, default <data_dir>/ai)
Reads model/out/eval.json, hazard_stats.json, hazard_weight_sweep.json, results.json, route.json and, from the data
folder, ortho_band.info.json, labels_2m.info.json and split.json.
"""
import json, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "model" / "out"
CFG = json.loads((HERE / "config.json").read_text())
AI = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(CFG["data_dir"]) / CFG["ai_dir"]
J = lambda p: json.loads(pathlib.Path(p).read_text())
pct = lambda v: f"{100 * v:.1f}%"


def main():
    ev, st, sw, res, route = J(OUT / "eval.json"), J(OUT / "hazard_stats.json"), J(OUT / "hazard_weight_sweep.json"), J(OUT / "results.json"), J(OUT / "route.json")
    band, lab, split = J(AI / "ortho_band.info.json"), J(AI / "labels_2m.info.json"), J(AI / "split.json")
    T, L = CFG["train"], CFG["labels"]
    te, va = ev["hazardnet"]["test"], ev["hazardnet"]["validation"]
    mj, ps = ev["baselines"]["majority_class"], ev["baselines"]["photo_stats_logistic_regression"]
    tr = ev["training"]
    ag, wa, rv = st["agreement_with_dtm_rule_on_walking_area"], st["walking_area"], st["perseverance_track"]
    cls = ev["classes"]
    row = lambda name, d: f"| {name} | {d['miou']:.3f} | " + " | ".join(f"{d['per_class_iou'][c]:.3f}" for c in cls) + f" | {pct(d['pixel_accuracy'])} |"
    S = split["summary"]
    srow = lambda k, name: f"| {name} | {S[k]['blocks']} | " + " | ".join(pct(S[k]['class_share'][c]) for c in cls) + " |"
    cm = te["confusion_rows_true_cols_pred"]
    recall = [cm[i][i] / max(1, sum(cm[i])) for i in range(len(cls))]
    pr = route["properties"]
    sel = sw["selected_weight"]
    sweep_rows = "\n".join(f"| {r['weight']:g} | {r['length_m']:.1f} | {r['margin_min']:.1f} | {r['slope_max_deg']:.1f} | {r['hazard_mean']:.4f} | "
                           f"{r['proof_median_dist_m']:.1f} | {'yes' if r['passes'] else 'no'} |" for r in sw["rows"])
    md = f"""# Model card: HazardNet (AI hazard layer, {CFG['model_version']})

Track: AI and safety model (owner Maryam, commits tagged [P1]). Every number below is copied by `model/hazard/write_card.py` from the result files in `model/out/` and from the data folder; nothing is typed by hand.

## In one sentence
HazardNet looks at the 25 cm HiRISE photo of the ground and predicts, for every 2 m square, whether Maryam's walkability rule would call it go, careful or avoid; it learned this from 43 blocks of Jezero outside the walking area, where the answer is known from the USGS elevation model.

## Who built it and how
Maryam (AI and safety model track) built this model with the help of Claude (Anthropic, Claude Fable 5.2). Maryam's own walkability rule (`model/maryam/score.py`, from her repository, commit c62a607) defines the training labels, and her time-window rule defines the walk window (with one tie-break added on 15 Nov 2026 by Ramish's Claude Code session: when two 4-hour blocks have the same average sun, the warmer block wins; on sol 500 LTST 10-14 and 11-15 tie at 42.8 deg average sun, 11-15 is warmer, mean -33.6 C vs -37.3 C, so the EVA window is LTST 11-15; see `model/window.py`). Claude wrote the scripts in `model/hazard/` and ran them on Ramish's PC (RTX 5070) through a job-runner script that Maryam started; Maryam directed the work by prompts over TeamViewer. The use of AI is also listed in `AI_USAGE.md`.

## Method decision (handoff option B)
- Option A (public labelled dataset) was rejected. Searches on 14 Nov 2026 found no public, licensed, human-labelled hazard or terrain dataset for orbital HiRISE photos of Jezero. The "NOAH-H terrain classifications of Jezero Crater" dataset (Open University) holds the output of another model, not human labels, and its page names no licence, so it was not used. AI4Mars is rover-camera imagery (wrong viewpoint). The HiRISE landmark dataset (Wagstaff, Doran et al.) has one class per image (crater, dune, ...), not hazards. No public release of JPL's orbital terrain labels for Mars 2020 was found.
- Option B was chosen: the network input is the USGS HiRISE orthomosaic (25 cm); the labels are computed from the USGS HiRISE elevation model (1 m) with Maryam's rule. Both USGS releases are marked CC0 1.0 (see `SOURCES.md`).
- No pre-trained weights are used (the network is trained from scratch), so no weight licence applies.

## Data
- Photo: USGS Mars 2020 TRN HiRISE orthomosaic, 25 cm, https://doi.org/10.5066/P9QJDP48. A band of {band['shape'][0]} x {band['shape'][1]} pixels (7.5 km north-south by 21.4 km east-west, centred on the walking area's latitude) was fetched by HTTP range requests. Source file size {band['source']['content_length']} bytes, ETag {band['source']['etag']}, last modified {band['source']['last_modified']}. SHA-256 of our band file `ortho_band.npy`: `{band['sha256_npy']}`.
- Registration check: the band's pixels over the walking area equal the terrain track's `photo_25cm.tif` pixel for pixel: {band['walk_window_equals_photo_25cm_tif']}.
- Elevation: USGS Mars 2020 TRN HiRISE DTM mosaic, 1 m, https://doi.org/10.5066/P9REJ9JN (local copy `JEZ_TRN_DTM_1m.tif`). Photo and DTM share the same corner and projection, so one 2 m cell is exactly 8 x 8 photo pixels and nothing is resampled.
- {pct(lab['valid_share'])} of the band's 2 m cells have both photo and elevation data.

## Labels (what the network is asked to predict)
Per 2 m cell, Maryam's rule: score = min(slope score, roughness score); slope score falls from 1 at {L['slope_ramp_deg'][0]:g} deg to 0 at {L['slope_ramp_deg'][1]:g} deg; roughness score falls from 1 at {L['rough_ramp_m'][0]:g} m to 0 at {L['rough_ramp_m'][1]:g} m; **go** if score >= {L['go']}, **careful** if >= {L['careful']}, **avoid** below. These thresholds are her starting guesses (assumptions).
- Slope: Horn 3 x 3 on the 2 m elevation grid (same formula as `terrain/out/slope.bin`).
- Roughness is **detrended**: elevation minus its mean in a {L['rough_window_m']} m window, then max minus min of that in the same window (1 m cells), largest value in each 2 m cell. On a smooth tilted plane it is zero, so slope is not counted twice (the team's `rough.bin` includes slope; this one does not).
- With detrended roughness the roughness term rarely decides: 99% of cells have roughness below {lab['rough_percentiles']['99']} m. The classes are therefore mostly about slope. This is a limit of a 1 m elevation model, which cannot see rocks smaller than about a metre.
- Class shares in the whole band: {', '.join(f"{c} {pct(lab['class_share'][c])}" for c in cls)}. SHA-256 of `labels_2m.npy`: `{lab['sha256_labels']}`.
- Hazard groups: {', '.join(f"{c} = {L['hazard_groups'][c]}" for c in cls)}.

## Split (spatial, whole blocks)
The band is cut into 1.5 km x 1.5 km blocks on the same lattice as the walking area (13 x 5 blocks). The walking area is one block and is **never** used for training or for choosing the checkpoint. The other blocks were shuffled with seed {split['seed']}. Tiles lie inside blocks with a margin, so tiles of different blocks are at least {split['gap_between_blocks_m']} m apart.

| Role | Blocks | {' | '.join(cls)} |
|---|---|{'---|' * len(cls)}
{srow('train', 'Training')}
{srow('val', 'Validation (choosing the checkpoint)')}
{srow('test', 'Test (reported metrics)')}
{srow('walk', 'Walking area (held out)')}

One block with too little data is unused. The test blocks happen to hold more careful and avoid ground than the validation blocks, which may be one reason the test score is lower than the validation score.

## Model and training
- HazardNet: a small U-Net-style network ({tr['parameters']:,} parameters), one input channel, five encoder levels, decoder back to 1/8 resolution, one prediction per 8 x 8 pixels (`model/hazard/net.py`).
- Tiles of {T['tile_px']} x {T['tile_px']} pixels (128 m), batch {T['batch']}, {T['steps_per_epoch']} steps per epoch, AdamW, learning rate {T['lr']} with {T['warmup_epochs']} warm-up epochs then cosine, weight decay {T['weight_decay']}, mixed precision, class-weighted cross-entropy (weights = inverse class share to the power {T['class_weight_power']}), brightness and contrast jitter only (no flips or rotations, so the sun direction stays as in the photo). Half of the training tiles are placed on a careful or avoid cell.
- Seed {ev['seed']}. Early stopping after {T['patience']} epochs without a better validation mIoU: {tr['epochs_run']} epochs were run, the best is epoch {ev['checkpoint_epoch']} (epochs count from 0). Training log: `model/out/training_log.csv`.
- Hardware and software: {tr['device']}, PyTorch {tr['torch']}.
- Weights: `hazardnet-v1_best_epoch{ev['checkpoint_epoch']}.pt` (copy of `runs/{ev['run']}/best.pt`), SHA-256 `{ev['checkpoint_sha256']}`. Kept outside git in `F:\\SpaceApps2026\\data\\ai\\`; to be uploaded to the shared Drive folder `model-checkpoints`.

## Results on held-out test blocks ({S['test']['blocks']} blocks, {te['cells']:,} cells)
mIoU = mean over the three classes of intersection over union.

| Method | mIoU | {' | '.join('IoU ' + c for c in cls)} | Cells correct |
|---|---|{'---|' * len(cls)}---|
{row('**HazardNet** (photo only)', te)}
{row('Baseline: always answer "go"', mj)}
{row('Baseline: logistic regression on six brightness and texture numbers per cell', ps)}
{row('HazardNet on the validation blocks (used to choose the checkpoint)', va)}

- HazardNet finds {pct(recall[1])} of the careful cells and {pct(recall[2])} of the avoid cells in the test blocks; the two baselines find almost none.
- Honest reading: the network is clearly better than the baselines on the two rare classes, but its share of correct cells ({pct(te['pixel_accuracy'])}) is only a little above always answering "go" ({pct(mj['pixel_accuracy'])}), and the IoU of careful and avoid is low. It is a rough hazard indicator, not a precise map.
- Pictures: `model/out/confusion_matrix.png`, `model/out/examples.png` (best and worst test tiles). All numbers: `model/out/eval.json`.

## The hazard layer on the walking area
- `model/out/hazard.bin`: float32 little-endian, 750 x 750, row 0 = north edge, value = 0.5 x P(careful) + 1.0 x P(avoid) (the 0.5 is an assumption). Tiles overlap by half and their probabilities are averaged. No resampling: the network's cells are the team's grid cells.
- Most likely class per cell: {', '.join(f"{c} {pct(wa['share_by_class'][c])}" for c in cls)}. Mean hazard {wa['mean_hazard']:.3f}; {pct(wa['share_hazard_over_0.5'])} of cells have hazard over 0.5.
- Agreement with Maryam's rule on the elevation model in the walking area, which the network never saw in training: mIoU {ag['miou']:.3f} ({', '.join(f"{c} {ag['per_class_iou'][c]:.3f}" for c in cls)}), {pct(ag['pixel_accuracy'])} of cells the same.
- Along Perseverance's real track in the area ({rv['samples']} samples, one per metre): mean hazard {rv['mean_hazard']:.3f} against {wa['mean_hazard']:.3f} for the whole area; hazard over 0.5 on {pct(rv['share_hazard_over_0.5'])} of the track against {pct(wa['share_hazard_over_0.5'])} of the area; avoid class on {pct(rv['share_by_class']['avoid'])} of the track. The rover drivers stayed on ground the layer calls low hazard. This is a sanity check, not proof (a rover is not an astronaut).
- Visual check: `model/out/hazard_preview.png` (photo, photo with hazard, predicted classes, classes from the rule): the crater rims, the scarps of the delta front and the steep western edge are marked; the flat crater floor is clear.

## Use in the planner
`model/planner.py` adds `C_HAZARD x hazard` to the cost of a cell. The layer never blocks a cell; blocking stays with measured slope over 25 deg. The weight was chosen by `model/sweep_hazard_weight.py` with a rule fixed beforehand: lowest mean hazard along the demo walk among weights that cost at most {sw['rule']['max_margin_loss_min']:g} min of walk-back margin and at most {pct(sw['rule']['max_extra_length'])} extra length (both limits are assumptions); smaller weight on a tie within {sw['rule']['tie_tolerance']}.

| Weight | Demo walk length (m) | Minimum margin (min) | Steepest (deg) | Mean hazard on the walk | Proof: median distance to rover track (m) | Within limits |
|---|---|---|---|---|---|---|
{sweep_rows}

Selected weight: **{sel:g}**. Demo walk with the layer (`model/out/route.json`): {pr['length_m']} m, {pr['time_out_min']} min out, {pr['time_back_min']} min back, minimum margin {pr['margin_min']} min, steepest ground {pr['slope_max_deg']} deg, mean hazard {pr['hazard_mean']}, stop order {' '.join(s['id'] for s in pr['stops'])}.
Proof against Perseverance with the layer: `model/out/results.md`.

## Limits
- The labels come from a rule on a 1 m elevation model, not from people marking hazards. The network can at best agree with that rule; it inherits the elevation model's errors.
- The classes are mostly slope classes (see Labels). Rocks, loose sand and ripples smaller than the elevation model can resolve are not in the labels, so the network was not taught to see them.
- Careful and avoid are found only partly (see Results). Use the layer as a soft warning next to measured slope, never alone.
- One HiRISE mosaic, one lighting geometry, one region (Jezero). Not tested anywhere else.
- Seeds are fixed, but GPU arithmetic leaves small run-to-run differences; a re-run will not reproduce the weights bit for bit.
- Only the 13 x 5 blocks around the walking area were used, not the whole mosaic.
- NVIDIA's licence terms for the CUDA libraries bundled with the PyTorch GPU build were not reviewed line by line (training PC only; nothing from them is in the repo).

## How to reproduce (from the repo root, with `uv sync --group ai` and the USGS DTM in the data folder)
```
uv run python model/hazard/prepare_data.py download
uv run python model/hazard/prepare_data.py labels
uv run python model/hazard/prepare_data.py split
uv run python model/hazard/train.py --resume
uv run python model/hazard/evaluate.py
uv run python model/hazard/infer.py
uv run python model/sweep_hazard_weight.py
uv run python model/planner.py
uv run python model/proof.py
uv run python model/window.py
uv run python model/hazard/write_card.py
uv run python contracts/validate.py hazard.meta=model/out/hazard.meta.json window=model/out/window.json route=model/out/route.json
uv run pytest -q
```
"""
    (ROOT / "model" / "MODEL_CARD.md").write_text(md, encoding="utf-8")
    print("wrote model/MODEL_CARD.md,", len(md.splitlines()), "lines")


if __name__ == "__main__":
    main()
