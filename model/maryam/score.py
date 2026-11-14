# Original author: Maryam (GitHub: Maryam19122005). Brought in from her repository
# https://github.com/Maryam19122005/marswalk-safe-path-engine, commit c62a607, file src/walkability/score.py.
# Code unchanged; only these three comment lines were added. Track: AI and safety model [P1].
"""
Person 1: safety score for each patch of Martian ground.

Input:  slope (degrees) and roughness (metres) for each grid cell.
Output: a score from 0 (avoid) to 1 (safe), plus go / careful / avoid labels.

The worst factor decides the score: a steep patch stays unsafe even if it is smooth.
The thresholds below are starting guesses. Tune them with the rover driving logs.
"""
import numpy as np

# Thresholds
SLOPE_SAFE_DEG = 10.0     # slopes below this are fine
SLOPE_AVOID_DEG = 25.0    # slopes above this are too steep to walk
ROUGH_SAFE_M = 0.3        # bumps below this are fine
ROUGH_AVOID_M = 1.5       # bumps above this are too rough

GO_MIN = 0.7              # score at or above this is "go"
CAREFUL_MIN = 0.4         # score at or above this is "careful"; below is "avoid"
IMPASSABLE = 0.2          # cells below this are never used in a route


def _ramp(value, good, bad):
    """Returns 1 at or below `good`, 0 at or above `bad`, and a straight line between."""
    return np.clip((bad - value) / (bad - good), 0.0, 1.0)


def slope_score(slope_deg):
    return _ramp(np.asarray(slope_deg, dtype=float), SLOPE_SAFE_DEG, SLOPE_AVOID_DEG)


def roughness_score(roughness_m):
    return _ramp(np.asarray(roughness_m, dtype=float), ROUGH_SAFE_M, ROUGH_AVOID_M)


def safety_score(slope_deg, roughness_m):
    """Combines both factors. The worst one decides."""
    return np.minimum(slope_score(slope_deg), roughness_score(roughness_m))


def category(score):
    score = np.asarray(score)
    return np.where(score >= GO_MIN, "go",
                    np.where(score >= CAREFUL_MIN, "careful", "avoid"))


def passable(score):
    """True where the route planner is allowed to walk."""
    return np.asarray(score) >= IMPASSABLE


if __name__ == "__main__":
    # Quick test with made-up numbers: 2x2 grid of slopes and roughness values
    slope = np.array([[2.0, 12.0],
                      [20.0, 30.0]])
    rough = np.array([[0.1, 0.2],
                      [0.5, 2.0]])

    score = safety_score(slope, rough)
    print("Scores:\n", np.round(score, 2))
    print("Labels:\n", category(score))
    print("Passable:\n", passable(score))
