// Written with AI assistance (Claude).
// Ghost rover (run 2, Phase 2d): Perseverance's real traverse (NASA/JPL-Caltech M20_traverse.json, clipped to the
// walking area by terrain/build_terrain.py -> rover_path.json) replayed by a translucent marker. The file has a sol
// per segment but no times inside a sol, so the marker moves by distance at a fixed display speed (said in the label).
// Pure helpers, unit-tested in walk.test.mjs. Track [P5].
export const GHOST_SPEED_MPS = 30;     // desk display speed only (6.7 km loops in under 4 min); NOT the rover's real speed
export const GHOST_WALK_MPS = 4;       // on foot at real size (display speed too)

/** Segments sorted by sol, each with cumulative distance; one continuous track (gaps between segments are jumps). */
export function roverTrack(rover) {
  const feats = (rover?.features || []).filter((f) => f.geometry?.coordinates?.length > 1)
    .slice().sort((a, b) => (a.properties?.sol ?? 0) - (b.properties?.sol ?? 0));
  const pts = [];
  let d = 0;
  for (const f of feats) {
    f.geometry.coordinates.forEach(([x, y], k) => {
      if (k > 0) { const p = pts[pts.length - 1]; d += Math.hypot(x - p.x, y - p.y); }
      pts.push({ x, y, d, sol: f.properties?.sol ?? null, jump: k === 0 && pts.length > 0 });
    });
  }
  return { pts, length: d };
}

/** Position, heading and sol at distance s along the track (wraps around). Binary search. Pure. */
export function roverAt(track, s) {
  const { pts, length } = track;
  if (!pts.length) return null;
  if (pts.length === 1 || length <= 0) return { x: pts[0].x, y: pts[0].y, heading: 0, sol: pts[0].sol };
  const t = ((s % length) + length) % length;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].d <= t) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], span = b.d - a.d;
  const f = span > 0 ? (t - a.d) / span : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, heading: Math.atan2(b.x - a.x, b.y - a.y), sol: b.jump ? a.sol : b.sol };
}

/** Label text: sol numbers only from the data file. Pure. */
export function ghostLabel(rover) {
  const sols = (rover?.features || []).map((f) => f.properties?.sol).filter(Number.isFinite);
  const range = sols.length ? ` (sols ${Math.min(...sols)}–${Math.max(...sols)})` : "";
  return { title: `Perseverance's real path${range}`, note: "moved at a fixed display speed: the data has no times within a sol" };
}
