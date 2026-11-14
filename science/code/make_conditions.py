# This file was written with help from Claude (AI). See AI_USAGE.md.
import csv
import io
import re
import pandas as pd
import requests
from urllib.parse import urljoin

ROOT = "https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/"
SOLS = [500, 501]
DUST_TAU = 0.5
RADIATION = 210
SOURCE = ("Typical conditions, not a forecast. temp_c: Perseverance MEDA air temperature sensors 1-3 (calibrated), mean of sols 500 and 501. "
          "pressure_pa: MEDA pressure sensor (derived), mean of sols 500 and 501. "
          "dust_tau: 880 nm opacity about 0.5 on low-dust sols 566-571 at the Jezero delta front, Savijarvi et al. 2024, Icarus 421, one value for all hours. "
          "radiation_uGy_per_day: Curiosity RAD at Gale Crater, not Jezero; Hassler et al. 2014, Science, 300-sol average 0.210 mGy/day, one value for all hours.")


def ls(u):
    r = requests.get(u, timeout=60)
    out = []
    for h in re.findall(r'href="([^"]+)"', r.text):
        if "?" in h:
            continue
        full = urljoin(u, h)
        if full.startswith(u) and full != u:
            out.append(full[len(u):])
    return out


def get_file(coll, sol, key):
    for d in ls(ROOT + coll + "/"):
        m = re.match(r"sol_(\d+)_(\d+)/", d)
        if m and int(m.group(1)) <= sol <= int(m.group(2)):
            folder = ROOT + coll + "/" + d + "sol_%04d/" % sol
            names = sorted(n for n in ls(folder) if key in n and n.upper().endswith(".CSV"))
            return folder + names[-1] if names else None
    return None


frames = []
for sol in SOLS:
    url = get_file("data_calibrated_env", sol, "CAL_ATS")
    print("downloading", url, flush=True)
    cols = ["LTST", "ATS_LOCAL_TEMP1", "ATS_LOCAL_TEMP2", "ATS_LOCAL_TEMP3"]
    df = pd.read_csv(io.StringIO(requests.get(url, timeout=300).text), usecols=cols)
    df["hour"] = df["LTST"].str[5:7].astype(int)
    t = df[cols[1:]].apply(pd.to_numeric, errors="coerce")
    t = t.where((t > 100) & (t < 400))
    df["k"] = t.mean(axis=1)
    frames.append(df[["hour", "k"]].dropna())

temp = pd.concat(frames).groupby("hour")["k"].mean() - 273.15
press = pd.read_csv("science/raw/pressure_hourly.csv", index_col="hour")["pressure_pa"]

missing = [h for h in range(24) if h not in temp.index or h not in press.index]
if missing:
    raise SystemExit("Missing hours: %s" % missing)

with open("science/conditions.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["ltst_hour", "temp_c", "pressure_pa", "dust_tau", "radiation_uGy_per_day", "source", "estimate"])
    for h in range(24):
        w.writerow([h, round(float(temp[h]), 1), round(float(press[h]), 1), DUST_TAU, RADIATION, SOURCE, "yes"])

for h in range(24):
    print(h, round(float(temp[h]), 1), round(float(press[h]), 1))
