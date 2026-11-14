# This file was written with help from Claude (AI). See AI_USAGE.md.
import io
import re
import numpy as np
import pandas as pd
import requests
from urllib.parse import urljoin

ROOT = "https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/"
STARTS = [500]


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


used = []
frames = []
for start in STARTS:
    for even in range(start, start + 24, 2):
        a = get_file("data_derived_env", even, "DER_PS")
        b = get_file("data_derived_env", even + 1, "DER_PS")
        if a and b:
            for url in (a, b):
                df = pd.read_csv(io.StringIO(requests.get(url, timeout=120).text), usecols=["LTST", "PRESSURE"])
                df["hour"] = df["LTST"].str[5:7].astype(int)
                df["p"] = pd.to_numeric(df["PRESSURE"], errors="coerce")
                df = df[(df["p"] > 0) & (df["p"] < 1e6)]
                frames.append(df[["hour", "p"]])
                used.append(url.split("/")[-1]); print("got", used[-1], flush=True)
            break

allp = pd.concat(frames)
table = allp.groupby("hour")["p"].mean().round(1)
print("Files used:")
for u in used:
    print(" ", u)
print("Hours covered:", len(table), "of 24")
print(table.to_string())
table.to_csv("science/raw/pressure_hourly.csv", header=["pressure_pa"])

ats = get_file("data_calibrated_env", 500, "ATS")
print("ATS file:", ats)
if ats:
    t = requests.get(ats, timeout=120).text.splitlines()
    print("\n".join(t[:3]))
