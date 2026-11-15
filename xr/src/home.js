// Written with AI assistance (Claude).
// "Get me home" (run 2, Phase 2a): ask the live planner for a route from where the walker is now back to the walk's
// start. Pure helpers (no Three.js / DOM), unit-tested in walk.test.mjs. Track [P5].
// Every number shown comes from the planner's response (length_m, time_out_min / per_vertex.t_min, margin_min)
// or, offline, from route.json (the walked path reversed). Nothing is estimated here.

export const PLANNER_URL = "https://phobos-planner.onrender.com";
export const FIRST_TRY_MS = 15000;   // a warm planner answered in 5.2 s (15 Nov 2026); longer = probably asleep
export const WAKE_TRY_MS = 75000;    // Render free plan: a cold start can take about a minute
const FRAME = "jezero-local-v1";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Request body for POST /plan. The walker's position (x, y) is between route vertices i and i+1; we snap it to
 * vertex i - back (a planned cell centre, so walkable ground by construction). `back` steps further back if the
 * planner still says the start cell is blocked.
 */
export function homeRequest(coords, i, pos, back = 0) {
  const k = Math.max(0, Math.min(coords.length - 1, i - back));
  const start = [coords[k][0], coords[k][1]];
  const end = [coords[0][0], coords[0][1]];
  return {
    body: { frame: FRAME, start, end, stops: [], use_hazard: true },
    vertex: k,
    snapped_m: pos ? dist(pos, start) : 0,
    atStart: k === 0,
  };
}

/** What kind of failure this was: "asleep" (timeout), "offline" (no network), "blocked" (422 blocked ground), "other". */
export function classifyError(err, online = true) {
  if (!online) return "offline";
  if (err?.name === "AbortError" || err?.timeout) return "asleep";
  if (err?.status === 422 && /blocked|cut off/i.test(err.message || "")) return "blocked";
  if (err?.name === "TypeError") return "offline";          // fetch network failure
  return "other";
}

async function postPlan(body, { url, fetchImpl, timeoutMs }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url.replace(/\/+$/, "") + "/plan", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); msg = j?.detail?.error || j?.detail || msg; } catch { /* keep HTTP code */ }
      throw Object.assign(new Error(String(msg)), { status: r.status });
    }
    return await r.json();
  } finally { clearTimeout(t); }
}

/**
 * Plans the way home. Steps: try (15 s) → if it timed out: onStatus("waking") and retry once (75 s) →
 * if the start is on blocked ground: step back along the walked route (up to 3 vertices further, then 10, 25) →
 * any other failure: return { fallback: true } so the caller reverses the walked path.
 * Returns { route, req, tries, snapped } or { fallback: true, reason }.
 */
export async function planHome(coords, i, pos, { url = PLANNER_URL, fetchImpl = globalThis.fetch, onStatus = () => {},
  online = () => globalThis.navigator?.onLine !== false, firstMs = FIRST_TRY_MS, wakeMs = WAKE_TRY_MS } = {}) {
  if (!online()) return { fallback: true, reason: "offline" };
  let woke = false, tries = 0;
  for (const back of [0, 3, 10, 25]) {
    const req = homeRequest(coords, i, pos, back);
    if (req.atStart) return { fallback: true, reason: "at-start", req };
    for (;;) {
      tries++;
      try {
        const route = await postPlan(req.body, { url, fetchImpl, timeoutMs: woke ? wakeMs : firstMs });
        return { route, req, tries };
      } catch (e) {
        const kind = classifyError(e, online());
        if (kind === "asleep" && !woke) { woke = true; onStatus("waking"); continue; }
        if (kind === "blocked") { onStatus("snapping"); break; }       // step further back along the route
        return { fallback: true, reason: kind, error: String(e?.message || e) };
      }
    }
  }
  return { fallback: true, reason: "blocked" };
}

/** Numbers for the visor / status line, straight from the planner response. */
export function homeSummary(route) {
  const p = route?.properties || {};
  const t = p.time_out_min ?? p.per_vertex?.t_min?.at(-1);
  return {
    length_m: p.length_m ?? null,
    time_min: Number.isFinite(t) ? t : null,
    margin_min: p.margin_min ?? null,
    text: `Return route: ${Number.isFinite(p.length_m) ? Math.round(p.length_m) : "?"} m, ~${Number.isFinite(t) ? Math.round(t) : "?"} min, margin ${Number.isFinite(p.margin_min) ? Math.floor(p.margin_min) : "?"} min`,
  };
}

/**
 * Offline fallback: the path already walked, reversed (vertex i back to 0, starting at the walker's position).
 * Time = route.json per_vertex.t_min[i] (the time the walk out took on the same ground). No margin (needs the planner).
 */
export function reversedWalkedPath(route, i, pos) {
  const c = route.geometry.coordinates;
  const k = Math.max(0, Math.min(c.length - 1, i));
  const pts = [];
  if (pos) pts.push([pos[0], pos[1]]);
  for (let j = k; j >= 0; j--) pts.push([c[j][0], c[j][1]]);
  let length = 0;
  for (let j = 1; j < pts.length; j++) length += dist(pts[j - 1], pts[j]);
  const t = route.properties.per_vertex.t_min;
  const time = (t[k] ?? 0) + (pos && k + 1 < c.length && t[k + 1] != null
    ? (t[k + 1] - t[k]) * Math.min(1, dist(c[k], pos) / Math.max(1e-9, dist(c[k], c[k + 1]))) : 0);
  return {
    coords: pts, length_m: length, time_min: time,
    text: `Walked path reversed (planner offline): ${Math.round(length)} m, ~${Math.round(time)} min`,
  };
}
