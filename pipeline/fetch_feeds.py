# Written with AI assistance (Claude). Track [P5].
"""Fetch the run-2 context feeds at BUILD time into pipeline/feeds/*.json (no key ever reaches the browser).

Each output file: {source, url_without_key, fetched_utc, licence, data}. A feed that fails is skipped (its old file,
if any, is kept) and reported; the apps never depend on a feed being present.

    uv run python pipeline/fetch_feeds.py            # all feeds
    uv run python pipeline/fetch_feeds.py horizons   # one feed

Feeds:
  horizons  JPL Horizons API (no key): Earth-Mars one-way light time today (+ distance), for "Light delay today".
  donki     NASA DONKI notifications, last 30 days (needs $env:NASA_API_KEY; read here only, never written anywhere).
  noaa_kp   NOAA SWPC planetary K-index, last ~7 days (no key). Measured near Earth: context only.
  usgs_names USGS/IAU Gazetteer of Planetary Nomenclature, Mars centre points: names near Jezero / the walking area.
"""
from __future__ import annotations

import io
import json
import math
import os
import pathlib
import struct
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "pipeline" / "feeds"
UA = "phobos-phantoms-build/1.0 (NASA Space Apps 2026 student project)"
NOW = datetime.now(timezone.utc)


def get(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def strip_key(url: str) -> str:
    """Remove api_key from a URL before it is stored or printed."""
    p = urllib.parse.urlsplit(url)
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query) if k.lower() != "api_key"]
    return urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, urllib.parse.urlencode(q), ""))


def write(name: str, source: str, url: str, licence: str, data) -> pathlib.Path:
    OUT.mkdir(parents=True, exist_ok=True)
    doc = {"source": source, "url_without_key": strip_key(url), "fetched_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"),
           "licence": licence, "data": data}
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


# ---------------------------------------------------------------------------------------------------------------
def horizons():
    day = NOW.strftime("%Y-%m-%d")
    nxt = (NOW + timedelta(days=1)).strftime("%Y-%m-%d")
    params = {"format": "json", "COMMAND": "'499'", "CENTER": "'500@399'", "EPHEM_TYPE": "'OBSERVER'",
              "START_TIME": f"'{day}'", "STOP_TIME": f"'{nxt}'", "STEP_SIZE": "'1d'", "QUANTITIES": "'20,21'",
              "OBJ_DATA": "'NO'"}
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
    res = json.loads(get(url))["result"]
    body = res[res.index("$$SOE") + 5: res.index("$$EOE")].strip().splitlines()
    rows = []
    for line in body:
        parts = line.split()
        # " 2026-Nov-15 00:00  delta(au)  deldot(km/s)  1-way_down_LT(min)"
        rows.append({"utc": f"{parts[0]} {parts[1]}", "delta_au": float(parts[2]), "deldot_km_s": float(parts[3]),
                     "one_way_light_time_min": float(parts[4])})
    data = {"target": "Mars (499)", "observer": "Earth geocentre (500@399)", "quantities": "20 (range), 21 (one-way light time)",
            "rows": rows, "today": rows[0]}
    return write("horizons", "JPL Horizons API (NASA/JPL Solar System Dynamics)", url,
                 "NASA/JPL public data service; no restrictions stated for ephemeris output", data)


def donki():
    key = os.environ.get("NASA_API_KEY")
    if not key:
        raise RuntimeError("NASA_API_KEY not set (skipping DONKI; the web map's live DONKI card still works)")
    start = (NOW - timedelta(days=30)).strftime("%Y-%m-%d")
    end = NOW.strftime("%Y-%m-%d")
    url = "https://api.nasa.gov/DONKI/notifications?" + urllib.parse.urlencode(
        {"startDate": start, "endDate": end, "type": "all", "api_key": key})
    items = json.loads(get(url))
    data = [{k: it.get(k) for k in ("messageType", "messageID", "messageIssueTime", "messageURL")} for it in items]
    return write("donki", "NASA CCMC DONKI notifications via api.nasa.gov (Sun activity, measured near Earth/Sun)", url,
                 "NASA data, public", {"start": start, "end": end, "count": len(data), "notifications": data})


def noaa_kp():
    url = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"
    raw = json.loads(get(url))
    head, rows = raw[0], raw[1:]
    data = [dict(zip(head, r)) for r in rows] if isinstance(head, list) else raw
    return write("noaa_kp", "NOAA Space Weather Prediction Center, planetary K-index (measured near Earth)", url,
                 "NOAA data, public domain (US Government work)", {"columns": head if isinstance(head, list) else None,
                                                                  "rows": data[-24:]})


def _read_dbf(b: bytes):
    """Minimal dBase III reader (stdlib only) -> list of dicts."""
    n_rec, hdr_len, rec_len = struct.unpack("<IHH", b[4:12])
    fields, off = [], 32
    while b[off] != 0x0D:
        name = b[off:off + 11].split(b"\0")[0].decode("ascii", "replace")
        ftype, flen = chr(b[off + 11]), b[off + 16]
        fields.append((name, ftype, flen)); off += 32
    out = []
    for i in range(n_rec):
        rec = b[hdr_len + i * rec_len: hdr_len + (i + 1) * rec_len]
        if not rec or rec[0:1] == b"*":
            continue
        pos, row = 1, {}
        for name, ftype, flen in fields:
            v = rec[pos:pos + flen].decode("utf-8", "replace").strip(); pos += flen
            row[name] = v
        out.append(row)
    return out


def usgs_names():
    url = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip"
    z = zipfile.ZipFile(io.BytesIO(get(url, timeout=120)))
    dbf = next(n for n in z.namelist() if n.lower().endswith(".dbf"))
    rows = _read_dbf(z.read(dbf))
    grid = json.loads((ROOT / "terrain" / "out" / "grid.json").read_text(encoding="utf-8"))
    box = grid["box_latlon"]
    lat0 = (box["lat_min"] + box["lat_max"]) / 2
    lon0 = (box["lon_min_e"] + box["lon_max_e"]) / 2
    R = 3396.19  # km, Mars 2000 sphere (same radius as grid.json's projection)

    def num(r, *keys):
        for k in keys:
            if k in r and r[k] not in ("", None):
                try:
                    return float(r[k])
                except ValueError:
                    pass
        return None

    near = []
    for r in rows:
        lat = num(r, "center_lat", "CENTER_LAT", "lat")
        lon = num(r, "center_lon", "CENTER_LON", "lon")
        if lat is None or lon is None:
            continue
        lon_e = lon % 360
        d = R * math.acos(max(-1, min(1, math.sin(math.radians(lat)) * math.sin(math.radians(lat0)) +
                                      math.cos(math.radians(lat)) * math.cos(math.radians(lat0)) * math.cos(math.radians(lon_e - lon0)))))
        if d <= 60:
            near.append({"name": r.get("clean_name") or r.get("name") or r.get("NAME"), "type": r.get("type") or r.get("feature_ty"),
                         "lat": round(lat, 4), "lon_e": round(lon_e, 4), "diameter_km": num(r, "diameter", "DIAMETER"),
                         "distance_km_from_walk_centre": round(d, 2),
                         "inside_walking_area": box["lat_min"] <= lat <= box["lat_max"] and box["lon_min_e"] <= lon_e <= box["lon_max_e"],
                         "approval": r.get("approval") or r.get("approvaldt") or r.get("approval_s")})
    near.sort(key=lambda x: x["distance_km_from_walk_centre"])
    return write("usgs_names", "USGS/IAU Gazetteer of Planetary Nomenclature, Mars centre points", url,
                 "Public domain (USGS); names approved by the IAU", {"walk_centre": {"lat": lat0, "lon_e": lon0},
                                                                      "radius_km": 60, "count": len(near), "features": near})


FEEDS = {"horizons": horizons, "donki": donki, "noaa_kp": noaa_kp, "usgs_names": usgs_names}

if __name__ == "__main__":
    want = sys.argv[1:] or list(FEEDS)
    failed = []
    for name in want:
        for attempt in (1, 2):   # brief: drop an endpoint that fails twice
            try:
                p = FEEDS[name]()
                print(f"ok   {name:11s} -> {p.relative_to(ROOT)}")
                break
            except Exception as e:  # noqa: BLE001 - report and continue
                k = os.environ.get("NASA_API_KEY") or ""
                msg = str(e).replace(k, "***") if k else str(e)
                if attempt == 2:
                    print(f"FAIL {name:11s} ({msg[:160]})"); failed.append(name)
    sys.exit(1 if len(failed) == len(want) else 0)
