# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Shared helpers for the AI hazard model: settings, file locations and the pixel geometry of the two USGS rasters.

Both USGS rasters (DTM 1 m, orthomosaic 25 cm) share the same upper-left corner and projection, so one DTM cell
is exactly 4 x 4 photo pixels. All row/column arithmetic lives here so no script resamples by guesswork.
"""
import hashlib, json, pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CFG = json.loads((HERE / "config.json").read_text())
DATA = pathlib.Path(CFG["data_dir"])
AI = DATA / CFG["ai_dir"]

# Upper-left corner and size of both USGS mosaics (read from the files on 14 Nov 2026 and asserted again in prepare_data.py)
X0, Y_TOP = 4577366.0, 1106618.0
DTM_W, DTM_H = 21400, 21488          # 1 m cells
ORTHO_W, ORTHO_H = 85600, 85952      # 0.25 m pixels
PX = 4                               # photo pixels per DTM cell (per side)


def dtm_row(y):   return int(round(Y_TOP - y))          # DTM row of the northern edge at projection y
def dtm_col(x):   return int(round(x - X0))
def band_dtm_rows():
    b = CFG["band"]
    return dtm_row(b["y_top"]), dtm_row(b["y_bottom"])  # [r0, r1)


def sha256(path, chunk=1 << 24):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            b = fh.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()
