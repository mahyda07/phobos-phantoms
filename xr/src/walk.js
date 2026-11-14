// Written with AI assistance (Claude).
// Step-in walk + visor helpers (pure, no Three.js / DOM, unit-tested in walk.test.mjs). Track [P5].
// The visor only SHOWS numbers from route.json per_vertex (and window.json for the sun); it never
// computes time or margin itself (Kashif's visor design v1, display/visor/README.md).

/** Mars hour (1/24 sol) in Earth minutes. LTST hours are Mars hours. */
export const MARS_HOUR_MIN = 24 * 60 * 1.0274912517 / 24; // 61.649 min

/**
 * For each stop (in properties.stops order = visiting order) find the route vertex where the walker is there:
 * the nearest vertex at or after the previous stop's vertex. Returns an array of vertex indices.
 */
export function stopVertexIndices(coords, stops) {
  const out = [];
  let from = 0;
  for (const s of stops) {
    let best = from, bd = Infinity;
    for (let i = from; i < coords.length; i++) {
      const d = Math.hypot(coords[i][0] - s.x, coords[i][1] - s.y);
      if (d < bd) { bd = d; best = i; }
    }
    out.push(best);
    from = best;
  }
  return out;
}

/** Index i such that t[i] <= tMin < t[i+1] (clamped), plus the fraction between i and i+1. */
export function vertexAt(t, tMin) {
  const n = t.length;
  if (tMin <= t[0]) return { i: 0, frac: 0 };
  if (tMin >= t[n - 1]) return { i: n - 1, frac: 0 };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= tMin) lo = mid; else hi = mid; }
  const span = t[hi] - t[lo];
  return { i: lo, frac: span > 0 ? (tMin - t[lo]) / span : 0 };
}

/**
 * Everything the walk + visor need at walking time tMin (minutes since the start of the route).
 * Values for the visor are taken from per_vertex at vertex i (no interpolation: the visor shows route data as is).
 * Position (x, y) is interpolated so the walk looks smooth.
 */
export function walkState(route, tMin, stopIdx) {
  const c = route.geometry.coordinates;
  const pv = route.properties.per_vertex;
  const { i, frac } = vertexAt(pv.t_min, tMin);
  const j = Math.min(i + 1, c.length - 1);
  const x = c[i][0] + (c[j][0] - c[i][0]) * frac;
  const y = c[i][1] + (c[j][1] - c[i][1]) * frac;
  const heading = Math.atan2(c[j][0] - c[i][0], c[j][1] - c[i][1]); // radians, 0 = north, + = east
  const stops = route.properties.stops || [];
  let next = null;
  for (let k = 0; k < stops.length; k++) if (stopIdx[k] > i) { next = { ...stops[k], vertex: stopIdx[k] }; break; }
  return {
    i, x, y, heading,
    margin_min: pv.margin_min[i], t_min: pv.t_min[i], slope_deg: pv.slope_deg[i], hazard: pv.hazard[i],
    next, done: i >= c.length - 1,
  };
}

/** LTST (Mars hours) at walking time tMin, starting at window.eva_window.start_ltst. null without a window. */
export function ltstAt(win, tMin) {
  if (!win?.eva_window) return null;
  return win.eva_window.start_ltst + tMin / MARS_HOUR_MIN;
}

/** Sun elevation for the whole LTST hour containing `ltst` (window.json is hourly). null if unknown. */
export function sunAt(win, ltst) {
  if (!win || ltst == null) return null;
  const h = Math.floor(ltst) % 24;
  const k = win.ltst_hours.indexOf(h);
  return k < 0 ? null : { hour: h, elev: win.sun_elev_deg[k] };
}

/** Visor text for each of the 6 fields (display rounding only, as in display/visor/README.md). */
export function visorFields(state, sun, isStandin) {
  const dash = "—";
  const num = (v, f) => (v == null || Number.isNaN(v) ? dash : f(v));
  return {
    margin: num(state.margin_min, (v) => String(Math.floor(v))),          // round DOWN: never show more time than there is
    timeOut: num(state.t_min, (v) => String(Math.round(v))),
    slope: num(state.slope_deg, (v) => v.toFixed(1)),
    hazard: num(state.hazard, (v) => v.toFixed(2)),
    stopId: state.next ? state.next.id : (state.done ? "END" : dash),
    stopName: state.next ? state.next.name : (state.done ? "walk complete" : dash),
    sun: sun ? String(Math.round(sun.elev)) : dash,
    sunSub: sun ? `at ${String(sun.hour).padStart(2, "0")}:00 LTST` : "time window not published yet",
    sunNote: sun ? "typical sol (climatology), not a forecast" : "",
    badge: isStandin ? "STAND-IN ROUTE" : "",
  };
}
