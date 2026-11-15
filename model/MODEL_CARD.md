# Model card: HazardNet (AI hazard layer, ai-hazard-v1)

Track: AI and safety model (owner Maryam, commits tagged [P1]). Every number below is copied by `model/hazard/write_card.py` from the result files in `model/out/` and from the data folder; nothing is typed by hand.

## In one sentence
HazardNet looks at the 25 cm HiRISE photo of the ground and predicts, for every 2 m square, whether Maryam's walkability rule would call it go, careful or avoid; it learned this from 43 blocks of Jezero outside the walking area, where the answer is known from the USGS elevation model.

## Who built it and how
Maryam (AI and safety model track) built this model with the help of Claude (Anthropic, Claude Fable 5.2). Maryam's own walkability rule (`model/maryam/score.py`, from her own earlier code) defines the training labels, and her time-window rule defines the walk window (with one tie-break added on 15 Nov 2026 by Ramish's Claude Code session: when two 4-hour blocks have the same average sun, the warmer block wins; on sol 500 LTST 10-14 and 11-15 tie at 42.8 deg average sun, 11-15 is warmer, mean -33.6 C vs -37.3 C, so the EVA window is LTST 11-15; see `model/window.py`). Claude wrote the scripts in `model/hazard/` and ran them on Ramish's PC (RTX 5070) through a job-runner script that Maryam started; Maryam directed the work by prompts over TeamViewer. The use of AI is also listed in `AI_USAGE.md`.

## Method decision (handoff option B)
- Option A (public labelled dataset) was rejected. Searches on 14 Nov 2026 found no public, licensed, human-labelled hazard or terrain dataset for orbital HiRISE photos of Jezero. The "NOAH-H terrain classifications of Jezero Crater" dataset (Open University) holds the output of another model, not human labels, and its page names no licence, so it was not used. AI4Mars is rover-camera imagery (wrong viewpoint). The HiRISE landmark dataset (Wagstaff, Doran et al.) has one class per image (crater, dune, ...), not hazards. No public release of JPL's orbital terrain labels for Mars 2020 was found.
- Option B was chosen: the network input is the USGS HiRISE orthomosaic (25 cm); the labels are computed from the USGS HiRISE elevation model (1 m) with Maryam's rule. Both USGS releases are marked CC0 1.0 (see `SOURCES.md`).
- No pre-trained weights are used (the network is trained from scratch), so no weight licence applies.

## Data
- Photo: USGS Mars 2020 TRN HiRISE orthomosaic, 25 cm, https://doi.org/10.5066/P9QJDP48. A band of 30000 x 85600 pixels (7.5 km north-south by 21.4 km east-west, centred on the walking area's latitude) was fetched by HTTP range requests. Source file size 7358523457 bytes, ETag "755fa7c86ddfeca7e2dd582fbd50e4ce-878", last modified Thu, 10 Nov 2022 21:40:51 GMT. SHA-256 of our band file `ortho_band.npy`: `c9372d849624afc1b63d8d5ad16b547a1d9f0837990a4f381509ce8177a5179e`.
- Registration check: the band's pixels over the walking area equal the terrain track's `photo_25cm.tif` pixel for pixel: True.
- Elevation: USGS Mars 2020 TRN HiRISE DTM mosaic, 1 m, https://doi.org/10.5066/P9REJ9JN (local copy `JEZ_TRN_DTM_1m.tif`). Photo and DTM share the same corner and projection, so one 2 m cell is exactly 8 x 8 photo pixels and nothing is resampled.
- 88.5% of the band's 2 m cells have both photo and elevation data.

## Labels (what the network is asked to predict)
Per 2 m cell, Maryam's rule: score = min(slope score, roughness score); slope score falls from 1 at 10 deg to 0 at 25 deg; roughness score falls from 1 at 0.3 m to 0 at 1.5 m; **go** if score >= 0.7, **careful** if >= 0.4, **avoid** below. These thresholds are her starting guesses (assumptions).
- Slope: Horn 3 x 3 on the 2 m elevation grid (same formula as `terrain/out/slope.bin`).
- Roughness is **detrended**: elevation minus its mean in a 5 m window, then max minus min of that in the same window (1 m cells), largest value in each 2 m cell. On a smooth tilted plane it is zero, so slope is not counted twice (the team's `rough.bin` includes slope; this one does not).
- With detrended roughness the roughness term rarely decides: 99% of cells have roughness below 0.601 m. The classes are therefore mostly about slope. This is a limit of a 1 m elevation model, which cannot see rocks smaller than about a metre.
- Class shares in the whole band: go 88.6%, careful 6.5%, avoid 5.0%. SHA-256 of `labels_2m.npy`: `a750237429129384b1a89e3056a553a3e75ffb9a9dfd9ed7911eb06893bc55ca`.
- Hazard groups: go = low, careful = medium, avoid = high.

## Split (spatial, whole blocks)
The band is cut into 1.5 km x 1.5 km blocks on the same lattice as the walking area (13 x 5 blocks). The walking area is one block and is **never** used for training or for choosing the checkpoint. The other blocks were shuffled with seed 20261114. Tiles lie inside blocks with a margin, so tiles of different blocks are at least 92 m apart.

| Role | Blocks | go | careful | avoid |
|---|---|---|---|---|
| Training | 43 | 88.0% | 6.6% | 5.4% |
| Validation (choosing the checkpoint) | 10 | 92.8% | 4.6% | 2.6% |
| Test (reported metrics) | 10 | 86.3% | 8.3% | 5.4% |
| Walking area (held out) | 1 | 88.6% | 5.1% | 6.3% |

One block with too little data is unused. The test blocks happen to hold more careful and avoid ground than the validation blocks, which may be one reason the test score is lower than the validation score.

## Model and training
- HazardNet: a small U-Net-style network (4,723,811 parameters), one input channel, five encoder levels, decoder back to 1/8 resolution, one prediction per 8 x 8 pixels (`model/hazard/net.py`).
- Tiles of 512 x 512 pixels (128 m), batch 16, 500 steps per epoch, AdamW, learning rate 0.001 with 2 warm-up epochs then cosine, weight decay 0.0001, mixed precision, class-weighted cross-entropy (weights = inverse class share to the power 0.5), brightness and contrast jitter only (no flips or rotations, so the sun direction stays as in the photo). Half of the training tiles are placed on a careful or avoid cell.
- Seed 20261114. Early stopping after 12 epochs without a better validation mIoU: 34 epochs were run, the best is epoch 21 (epochs count from 0). Training log: `model/out/training_log.csv`.
- Hardware and software: NVIDIA GeForce RTX 5070, PyTorch 2.11.0+cu128.
- Weights: `hazardnet-v1_best_epoch21.pt` (copy of `runs/hazardnet-v1/best.pt`), SHA-256 `3f335677b72796d16a5d73d9383fe6ddd806570ce15d7e20fef4a5a4caa11153`. Kept outside git in `F:\SpaceApps2026\data\ai\`; to be uploaded to the shared Drive folder `model-checkpoints`.

## Results on held-out test blocks (10 blocks, 4,837,698 cells)
mIoU = mean over the three classes of intersection over union.

| Method | mIoU | IoU go | IoU careful | IoU avoid | Cells correct |
|---|---|---|---|---|---|
| **HazardNet** (photo only) | 0.465 | 0.888 | 0.266 | 0.241 | 86.6% |
| Baseline: always answer "go" | 0.287 | 0.860 | 0.000 | 0.000 | 86.0% |
| Baseline: logistic regression on six brightness and texture numbers per cell | 0.291 | 0.856 | 0.017 | 0.001 | 85.5% |
| HazardNet on the validation blocks (used to choose the checkpoint) | 0.527 | 0.942 | 0.274 | 0.364 | 92.9% |

- HazardNet finds 49.4% of the careful cells and 29.4% of the avoid cells in the test blocks; the two baselines find almost none.
- Honest reading: the network is clearly better than the baselines on the two rare classes, but its share of correct cells (86.6%) is only a little above always answering "go" (86.0%), and the IoU of careful and avoid is low. It is a rough hazard indicator, not a precise map.
- Pictures: `model/out/confusion_matrix.png`, `model/out/examples.png` (best and worst test tiles). All numbers: `model/out/eval.json`.

## The hazard layer on the walking area
- `model/out/hazard.bin`: float32 little-endian, 750 x 750, row 0 = north edge, value = 0.5 x P(careful) + 1.0 x P(avoid) (the 0.5 is an assumption). Tiles overlap by half and their probabilities are averaged. No resampling: the network's cells are the team's grid cells.
- Most likely class per cell: go 86.6%, careful 8.7%, avoid 4.7%. Mean hazard 0.127; 8.1% of cells have hazard over 0.5.
- Agreement with Maryam's rule on the elevation model in the walking area, which the network never saw in training: mIoU 0.573 (go 0.931, careful 0.262, avoid 0.527), 91.1% of cells the same.
- Along Perseverance's real track in the area (7136 samples, one per metre): mean hazard 0.049 against 0.127 for the whole area; hazard over 0.5 on 1.0% of the track against 8.1% of the area; avoid class on 0.0% of the track. The rover drivers stayed on ground the layer calls low hazard. This is a sanity check, not proof (a rover is not an astronaut).
- Visual check: `model/out/hazard_preview.png` (photo, photo with hazard, predicted classes, classes from the rule): the crater rims, the scarps of the delta front and the steep western edge are marked; the flat crater floor is clear.

## Use in the planner
`model/planner.py` adds `C_HAZARD x hazard` to the cost of a cell. The layer never blocks a cell; blocking stays with measured slope over 25 deg. The weight was chosen by `model/sweep_hazard_weight.py` with a rule fixed beforehand: lowest mean hazard along the demo walk among weights that cost at most 10 min of walk-back margin and at most 10.0% extra length (both limits are assumptions); smaller weight on a tie within 0.005.

| Weight | Demo walk length (m) | Minimum margin (min) | Steepest (deg) | Mean hazard on the walk | Proof: median distance to rover track (m) | Within limits |
|---|---|---|---|---|---|---|
| 0 | 4297.3 | 138.0 | 22.2 | 0.0583 | 17.8 | yes |
| 0.5 | 4300.0 | 137.5 | 22.2 | 0.0466 | 17.0 | yes |
| 1 | 4301.2 | 138.1 | 22.2 | 0.0456 | 15.7 | yes |
| 2 | 4310.9 | 137.3 | 22.2 | 0.0427 | 16.5 | yes |
| 4 | 4383.4 | 136.1 | 22.3 | 0.0341 | 16.0 | yes |
| 8 | 4439.5 | 135.2 | 22.5 | 0.0305 | 22.3 | yes |

Selected weight: **4**. Demo walk with the layer (`model/out/route.json`): 4383.4 m, 79.2 min out, 19.1 min back, minimum margin 136.1 min, steepest ground 22.3 deg, mean hazard 0.034, stop order S1 S3 S5 S2 S4.
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
