# Original author: Maryam (GitHub: Maryam19122005). Brought in from her repository
# https://github.com/Maryam19122005/marswalk-safe-path-engine, commit c62a607, file src/planner/route.py.
# One line changed: the import now reads model.maryam.score (was src.walkability.score). Kept as a credited reference; the team planner is model/planner.py.
"""
Person 1: safest route planner.

Input:  a safety score grid (from src/walkability/score.py), a start cell, and a goal cell.
Output: the list of cells to walk, from start to goal, avoiding unsafe ground.

Safer ground costs less, so the planner prefers a longer safe path over a short risky one.
"""
import heapq
import numpy as np

from model.maryam.score import passable

CELL_M = 10.0          # metres per grid cell; set to the real data resolution later
SAFETY_WEIGHT = 4.0    # how strongly the planner avoids risky ground


def step_cost(score_value):
    """Cost of entering one cell. Score 1 (safe) costs 1.0; score 0 costs 5.0."""
    return 1.0 + SAFETY_WEIGHT * (1.0 - float(score_value))


def plan_route(score, start, goal):
    """Returns a list of (row, col) cells from start to goal, or None if no safe route exists."""
    score = np.asarray(score, dtype=float)
    rows, cols = score.shape
    ok = passable(score)
    start, goal = tuple(start), tuple(goal)
    if not (ok[start] and ok[goal]):
        return None

    def heuristic(cell):
        # Straight-line steps to the goal. Never overestimates, since each step costs at least 1.0.
        return abs(cell[0] - goal[0]) + abs(cell[1] - goal[1])

    open_heap = [(heuristic(start), 0.0, start)]
    came_from = {}
    best = {start: 0.0}

    while open_heap:
        _, cost_so_far, cell = heapq.heappop(open_heap)
        if cell == goal:
            return _rebuild_path(came_from, cell)
        if cost_so_far > best.get(cell, np.inf):
            continue  # found a cheaper way here already

        r, c = cell
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols):
                continue
            if not ok[nr, nc]:
                continue
            new_cost = cost_so_far + step_cost(score[nr, nc])
            nxt = (nr, nc)
            if new_cost < best.get(nxt, np.inf):
                best[nxt] = new_cost
                came_from[nxt] = cell
                heapq.heappush(open_heap, (new_cost + heuristic(nxt), new_cost, nxt))
    return None


def _rebuild_path(came_from, cell):
    path = [cell]
    while cell in came_from:
        cell = came_from[cell]
        path.append(cell)
    return path[::-1]


def route_stats(path, score):
    """Summary of a route: number of steps, approximate distance, and the riskiest cell it passes."""
    if not path:
        return None
    steps = len(path) - 1
    lowest = min(float(score[r, c]) for r, c in path)
    return {
        "steps": steps,
        "distance_m": round(steps * CELL_M),
        "lowest_score": round(lowest, 2),
    }


if __name__ == "__main__":
    # Test 1: a 5x5 field where column 2 is a wall, except one gap at row 2.
    score = np.ones((5, 5))
    score[:, 2] = 0.0
    score[2, 2] = 1.0
    path = plan_route(score, (0, 0), (4, 4))
    print("Route through the gap:", path)
    print("Stats:", route_stats(path, score))

    # Test 2: a full wall with no gap. The planner should find no route.
    wall = np.ones((5, 5))
    wall[:, 2] = 0.0
    print("Route through full wall:", plan_route(wall, (0, 0), (4, 4)))
