# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Time window for the walk: model/out/window.json (contracts/window.schema.json).

Rule (Maryam's time_window.py, unchanged): an hour is good when the sun is at least 15 deg above the horizon AND
dust opacity is at most 1.0. The EVA window is the block of WALK_HOURS whole hours with the highest average sun
that fits inside a run of good hours (her best_walk()).
Inputs: sun height per local true solar hour from the NASA GISS Mars24 algorithm (functions reused from
pipeline/window_basic.py) for Jezero on Perseverance sol 500; dust opacity, air temperature and pressure per hour
from science/conditions.csv (MEDA; Mahida). Temperature and pressure are shown but are not part of the rule.
Typical sol, not a forecast.  Run from the repo root:  uv run python model/window.py
"""
import csv, datetime, json, math, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from model.maryam.time_window import MAX_DUST_OPACITY, MIN_SUN_ELEVATION_DEG, HourForecast, best_walk, good_windows  # noqa: E402
from pipeline import window_basic as wb   # noqa: E402

WALK_HOURS = 4      # the planner's EVA time limit (240 min, docs/cost-model.md) in whole hours


def build():
    utc = wb.LANDING_UTC + datetime.timedelta(days=wb.SOL * wb.SOL_DAYS)
    ls, dec, r_au, dt = wb.mars24(utc)
    lat, d = math.radians(wb.LAT), math.radians(dec)
    elev, az = [], []
    for h in range(24):
        H = math.radians((h - 12) * 15.0)
        s = math.sin(lat) * math.sin(d) + math.cos(lat) * math.cos(d) * math.cos(H)
        a = math.degrees(math.atan2(-math.sin(H) * math.cos(d), math.cos(lat) * math.sin(d) - math.sin(lat) * math.cos(d) * math.cos(H))) % 360
        elev.append(round(math.degrees(math.asin(s)), 1)); az.append(round(a, 1))
    cond = {int(r["ltst_hour"]): r for r in csv.DictReader(open(ROOT / "science/conditions.csv", newline="", encoding="utf-8"))}
    temp = [float(cond[h]["temp_c"]) for h in range(24)]
    pres = [float(cond[h]["pressure_pa"]) for h in range(24)]
    dust = [float(cond[h]["dust_tau"]) for h in range(24)]
    forecast = [HourForecast(h, elev[h], dust[h]) for h in range(24)]
    windows = good_windows(forecast)
    best = best_walk(forecast, WALK_HOURS)
    if best is None:
        raise SystemExit(f"no run of good hours is {WALK_HOURS} h long: good windows {windows}")
    olt = wb.earth_mars_km(dt, ls, r_au) / wb.C_KM_S / 60.0
    t_lo = min(temp[best["start_hour"]:best["end_hour"]]); t_hi = max(temp[best["start_hour"]:best["end_hour"]])
    win = {
        "frame": "jezero-local-v1", "sol": wb.SOL, "ls_deg": round(ls, 1), "utc": utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ltst_hours": list(range(24)), "sun_elev_deg": elev, "sun_az_deg": az, "temp_c": temp, "pressure_pa": pres,
        "eva_window": {"start_ltst": float(best["start_hour"]), "end_ltst": float(best["end_hour"])},
        "one_way_light_time_min": round(olt, 1),
        "notes": (f"Time window by the AI and safety model track (model/window.py). Typical sol, not a forecast. Rule (Maryam's time_window.py): "
                  f"an hour is good when the sun is >= {MIN_SUN_ELEVATION_DEG:g} deg and dust opacity is <= {MAX_DUST_OPACITY:g}; good hours here: "
                  f"{', '.join(f'LTST {a}-{b}' for a, b in windows)}. EVA window = the {WALK_HOURS} h block with the highest average sun inside the good hours "
                  f"(average sun {best['avg_sun_deg']} deg). Sun: NASA GISS Mars24 algorithm (Allison & McEwen 2000) for Jezero {wb.LAT} N {wb.LON_E} E on "
                  f"Perseverance sol {wb.SOL} ({utc:%Y-%m-%d}, Ls {ls:.1f} deg). Dust opacity {min(dust):g}-{max(dust):g}, temperature and pressure: "
                  f"science/conditions.csv (MEDA). Temperature is NOT part of the rule: air is {t_lo:g} to {t_hi:g} C during the window. "
                  f"Light time from low-precision orbits (about +/-1 min)."),
    }
    return win, windows, best


def main():
    win, windows, best = build()
    out = ROOT / "model" / "out"; out.mkdir(parents=True, exist_ok=True)
    (out / "window.json").write_text(json.dumps(win, indent=1))
    print("sun elev by LTST hour:", win["sun_elev_deg"])
    print("good windows:", windows, "| best walk:", best)
    print(f"EVA window LTST {win['eva_window']['start_ltst']:g}-{win['eva_window']['end_ltst']:g}")


if __name__ == "__main__":
    main()
