# Written with AI assistance (Claude).
"""STAND-IN time window (PLAN.md D27): pipeline/fallback/window.json (contracts/window.schema.json).
Replaced by Maryam's model/out/window.json when it lands (the headset and web display prefer that file).

Sun position: NASA GISS Mars24 algorithm (Allison & McEwen 2000, Planet. Space Sci. 48, 215-235;
https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) for Jezero (18.45 N, 77.41 E) on Perseverance
sol SOL. LTST is local TRUE solar time, so the sun's hour angle is (LTST - 12 h) x 15 deg.
Temperature / pressure per LTST hour: Mahida's science/conditions.csv (MEDA, mean of sols 500 and 501).
EVA window (ASSUMPTION): the longest run of whole LTST hours with sun elevation >= SUN_MIN_DEG
(good light, short shadows) and air temperature >= TEMP_MIN_C.
One-way light time: Earth-Mars distance from low-precision orbits (Mars24 heliocentric distance +
Earth mean orbit), about +/-1 min; for display only.
Run from the repo root:  uv run python pipeline/window_basic.py
"""
import csv, datetime, json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
LAT, LON_E = 18.45, 77.41               # Jezero walking area centre (deg, planetocentric, east)
SOL = 500                               # Perseverance mission sol (same sols as conditions.csv)
LANDING_UTC = datetime.datetime(2021, 2, 18, 20, 55, tzinfo=datetime.timezone.utc)   # sol 0 touchdown
SOL_DAYS = 1.0274912517                 # Earth days per sol
SUN_MIN_DEG, TEMP_MIN_C = 30.0, -40.0   # ASSUMPTION
AU_KM, C_KM_S = 149597870.7, 299792.458


def mars24(utc):
    """Return (Ls deg, solar declination deg, Mars heliocentric distance AU, days since J2000 TT)."""
    jd_ut = utc.timestamp() / 86400.0 + 2440587.5
    jd_tt = jd_ut + (69.184) / 86400.0              # TT - UTC = 37 s + 32.184 s
    dt = jd_tt - 2451545.0
    M = math.radians(19.3871 + 0.52402073 * dt)
    a_fms = 270.3871 + 0.524038496 * dt
    A = (0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018)
    tau = (2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493)
    phi = (49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095)
    pbs = sum(a * math.cos(math.radians(0.985626 * dt / t + p)) for a, t, p in zip(A, tau, phi))
    v_m = ((10.691 + 3.0e-7 * dt) * math.sin(M) + 0.623 * math.sin(2 * M) + 0.050 * math.sin(3 * M)
           + 0.005 * math.sin(4 * M) + 0.0005 * math.sin(5 * M) + pbs)
    ls = (a_fms + v_m) % 360.0
    dec = math.degrees(math.asin(0.42565 * math.sin(math.radians(ls)))) + 0.25 * math.sin(math.radians(ls))
    r_au = 1.52367934 * (1.00436 - 0.09309 * math.cos(M) - 0.004336 * math.cos(2 * M)
                         - 0.00031 * math.cos(3 * M) - 0.00003 * math.cos(4 * M))
    return ls, dec, r_au, dt


def earth_mars_km(dt, ls, r_mars):
    """Low-precision Earth-Mars distance: Mars from Ls (ecliptic longitude ~ Ls + 85.06 deg at J2000 equinox), Earth mean orbit."""
    lam_m = math.radians((ls + 85.061) % 360)                     # heliocentric ecliptic longitude of Mars (approx)
    L_e = math.radians((100.46435 + 0.985609101 * dt) % 360)      # Earth mean longitude
    g = math.radians((357.52911 + 0.98560028 * dt) % 360)
    lam_e = L_e + math.radians(1.9148 * math.sin(g) + 0.02 * math.sin(2 * g))
    r_e = 1.00014 - 0.01671 * math.cos(g) - 0.00014 * math.cos(2 * g)
    xm, ym = r_mars * math.cos(lam_m), r_mars * math.sin(lam_m)
    xe, ye = r_e * math.cos(lam_e), r_e * math.sin(lam_e)
    return math.hypot(xm - xe, ym - ye) * AU_KM


def main():
    utc = LANDING_UTC + datetime.timedelta(days=SOL * SOL_DAYS)
    ls, dec, r_au, dt = mars24(utc)
    lat, d = math.radians(LAT), math.radians(dec)
    elev, az = [], []
    for h in range(24):
        H = math.radians((h - 12) * 15.0)
        s = math.sin(lat) * math.sin(d) + math.cos(lat) * math.cos(d) * math.cos(H)
        e = math.degrees(math.asin(s))
        a = math.degrees(math.atan2(-math.sin(H) * math.cos(d), math.cos(lat) * math.sin(d) - math.sin(lat) * math.cos(d) * math.cos(H))) % 360
        elev.append(round(e, 1)); az.append(round(a, 1))
    cond = {int(r["ltst_hour"]): r for r in csv.DictReader(open(ROOT / "science/conditions.csv", newline="", encoding="utf-8"))}
    temp = [float(cond[h]["temp_c"]) for h in range(24)]
    pres = [float(cond[h]["pressure_pa"]) for h in range(24)]
    ok = [elev[h] >= SUN_MIN_DEG and temp[h] >= TEMP_MIN_C for h in range(24)]
    best, cur = (0, -1), None
    for h in range(24):
        if ok[h]:
            cur = h if cur is None else cur
            if h - cur > best[1] - best[0]: best = (cur, h)
        else:
            cur = None
    start, end = (float(best[0]), float(best[1] + 1)) if best[1] >= 0 else (10.0, 15.0)
    olt = earth_mars_km(dt, ls, r_au) / C_KM_S / 60.0
    win = {
        "frame": "jezero-local-v1", "sol": SOL, "ls_deg": round(ls, 1),
        "ltst_hours": list(range(24)), "sun_elev_deg": elev, "sun_az_deg": az, "temp_c": temp, "pressure_pa": pres,
        "eva_window": {"start_ltst": start, "end_ltst": end},
        "one_way_light_time_min": round(olt, 1),
        "notes": (f"STAND-IN (pipeline/window_basic.py) until the planner team's window.json. Typical sol, not a forecast. "
                  f"Sun: NASA GISS Mars24 algorithm (Allison & McEwen 2000) for Jezero {LAT} N {LON_E} E on Perseverance sol {SOL} "
                  f"({utc:%Y-%m-%d}, Ls {ls:.1f} deg, solar declination {dec:.1f} deg). Temperature/pressure: science/conditions.csv "
                  f"(MEDA, sols 500-501). ASSUMPTION: EVA window = longest run of LTST hours with sun >= {SUN_MIN_DEG:g} deg and "
                  f"air >= {TEMP_MIN_C:g} C. Light time from low-precision orbits (about +/-1 min)."),
    }
    out = ROOT / "pipeline/fallback"; out.mkdir(exist_ok=True)
    (out / "window.json").write_text(json.dumps(win, indent=1))
    print(f"sol {SOL} = {utc:%Y-%m-%d} UTC | Ls {ls:.1f} | declination {dec:.1f} | light time {olt:.1f} min")
    print("sun elev by LTST hour:", elev)
    print("temp by hour:", temp)
    print(f"EVA window LTST {start:g}-{end:g}")


if __name__ == "__main__":
    main()
