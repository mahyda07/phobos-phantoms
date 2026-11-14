# Original author: Maryam (GitHub: Maryam19122005). Brought in from her repository
# https://github.com/Maryam19122005/marswalk-safe-path-engine, commit c62a607, file src/planner/time_window.py.
# Code unchanged; only these three comment lines were added. Track: AI and safety model [P1].
"""
Person 1: sun and dust time window.

Input:  an hourly forecast, with sun elevation (degrees) and dust opacity for each hour.
Output: the hours good for walking, and the best walk that fits the time budget.

These limits are starting guesses. Tune them with mission-planning data and team decisions.
"""
from dataclasses import dataclass

MIN_SUN_ELEVATION_DEG = 15.0   # below this, light is too weak for cameras and science
MAX_DUST_OPACITY = 1.0         # above this, dust blocks too much light and visibility


@dataclass
class HourForecast:
    hour: int                  # local Mars hour, 0 to 23
    sun_elevation_deg: float
    dust_opacity: float


def hour_is_good(f):
    return f.sun_elevation_deg >= MIN_SUN_ELEVATION_DEG and f.dust_opacity <= MAX_DUST_OPACITY


def good_windows(forecast):
    """Groups consecutive good hours. Returns (start_hour, end_hour) pairs, end exclusive."""
    windows = []
    start = prev = None
    for f in sorted(forecast, key=lambda x: x.hour):
        if not hour_is_good(f):
            if start is not None:
                windows.append((start, prev + 1))
                start = None
            continue
        if start is not None and f.hour == prev + 1:
            prev = f.hour
        else:
            if start is not None:
                windows.append((start, prev + 1))
            start = prev = f.hour
    if start is not None:
        windows.append((start, prev + 1))
    return windows


def best_walk(forecast, walk_hours):
    """Finds the walk of `walk_hours` length with the highest average sun, fully inside a good window.
    Returns None if no good window is long enough."""
    by_hour = {f.hour: f for f in forecast}
    best = None
    for start, end in good_windows(forecast):
        for s in range(start, end - walk_hours + 1):
            avg_sun = sum(by_hour[h].sun_elevation_deg for h in range(s, s + walk_hours)) / walk_hours
            if best is None or avg_sun > best["avg_sun_deg"]:
                best = {"start_hour": s, "end_hour": s + walk_hours,
                        "avg_sun_deg": round(avg_sun, 1)}
    return best


if __name__ == "__main__":
    # Made-up forecast for hours 6 to 18. A dust storm sits around hours 9 and 10.
    sun = [2, 10, 18, 26, 33, 38, 40, 38, 33, 26, 18, 10, 2]
    dust = [0.5, 0.5, 0.6, 1.5, 1.5, 0.6, 0.6, 0.6, 0.7, 0.7, 0.8, 1.1, 1.2]
    forecast = [HourForecast(6 + i, sun[i], dust[i]) for i in range(len(sun))]

    print("Good windows:", good_windows(forecast))
    print("Best 3-hour walk:", best_walk(forecast, 3))
    print("Best 6-hour walk:", best_walk(forecast, 6))
    print("Best 8-hour walk:", best_walk(forecast, 8))
