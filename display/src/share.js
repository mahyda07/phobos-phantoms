// Written with AI assistance (Claude).
// "Copy link to this view": puts the current map view into the URL hash (#p=700&z=1.5&...) and copies the link.
// PRIVACY: the link holds ONLY map state (point index, zoom, centre, overlay ids, proof on/off and, for a live
// planner route, its start/end in local metres, stop ids and the hazard switch). No personal data. It uses the
// hash, never query params, so browsers do not send it to any server.
// RULE: the link only restores UI state. It never carries route numbers; a planned route is re-planned (optional
// replan callback in main.js), never rebuilt from the link.
//
// encodeState / decodeState are pure (run under `node --test`). share.css is NOT imported here (keeps tests
// DOM-free); main.js imports it, like briefing.css.
//
// State object (every field optional):
//   { point: int>=0, zoom: number, center: [lat, lng] (CRS.Simple map units), layers: ["slope", ...],
//     proof: bool, start: [x, y], end: [x, y] (local metres, integers), stops: ["S1", "S3"], useHazard: bool }
// Hash keys: p z c l v s e k h (fixed order below).

export const LAYER_IDS = ["slope", "rough", "dem", "hazard", "science", "rover", "stops", "route"];
const MAX_HASH = 2000; // longer hashes are not ours: ignore them
const STOP_RE = /^S\d{1,4}$/;
const INT_RE = /^-?\d{1,9}$/;
const NUM_RE = /^-?\d{1,9}(\.\d{1,6})?$/;

const fix1 = (n) => { const s = n.toFixed(1); return s === "-0.0" ? "0.0" : s; };
const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const isPair = (a) => Array.isArray(a) && a.length === 2 && a.every(isNum);

/** Pure: state object -> "p=700&z=1.5&c=375.0,375.0&l=slope,rover&v=1&s=..&e=..&k=S1.S3&h=1" (no leading "#"). */
export function encodeState(state = {}) {
  const st = state || {};
  const q = new URLSearchParams();
  if (Number.isInteger(st.point) && st.point >= 0) q.set("p", String(st.point));
  if (isNum(st.zoom)) q.set("z", fix1(st.zoom));
  if (isPair(st.center)) q.set("c", st.center.map(fix1).join(","));
  if (Array.isArray(st.layers)) {
    const ids = LAYER_IDS.filter((id) => st.layers.includes(id)); // known ids only, fixed order
    q.set("l", ids.join(",")); // "l=" means "all overlays off" (differs from no l at all = leave as is)
  }
  if (st.proof === true) q.set("v", "1");
  // Planner fields only when the route came from the live planner (start AND end known).
  if (isPair(st.start) && isPair(st.end)) {
    q.set("s", st.start.map((n) => String(Math.round(n))).join(","));
    q.set("e", st.end.map((n) => String(Math.round(n))).join(","));
    if (Array.isArray(st.stops)) {
      const ids = st.stops.map(String).filter((s) => STOP_RE.test(s));
      if (ids.length) q.set("k", ids.join("."));
    }
    if (typeof st.useHazard === "boolean") q.set("h", st.useHazard ? "1" : "0");
  }
  // URLSearchParams escapes "," as %2C; keep the link readable (",", "." are safe in a hash).
  return q.toString().replace(/%2C/gi, ",");
}

function pair(v, re) {
  if (typeof v !== "string") return undefined;
  const parts = v.split(",");
  if (parts.length !== 2 || !parts.every((x) => re.test(x))) return undefined;
  const nums = parts.map(Number);
  return nums.every(Number.isFinite) ? nums : undefined;
}

/**
 * Pure: "#p=700&..." or "p=700&..." -> validated state object (same shape encodeState takes).
 * Anything malformed is dropped (not clamped): the caller clamps the point index to the route length.
 * s/e/k/h are kept only when both s and e are valid; k is dropped as a whole if any id is bad or repeated.
 */
export function decodeState(hash) {
  const out = {};
  if (typeof hash !== "string") return out;
  let h = hash.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (!h || h.length > MAX_HASH) return out;
  let q;
  try { q = new URLSearchParams(h); } catch { return out; }
  const get = (k) => (q.has(k) ? q.get(k).trim() : undefined);

  const p = get("p");
  if (p !== undefined && /^\d{1,9}$/.test(p)) out.point = Number(p);

  const z = get("z");
  if (z !== undefined && NUM_RE.test(z)) out.zoom = Number(z);

  const c = pair(get("c"), NUM_RE);
  if (c) out.center = c;

  const l = get("l");
  if (l !== undefined) {
    const ids = l === "" ? [] : l.split(",").map((s) => s.trim());
    const known = ids.filter((id) => LAYER_IDS.includes(id));
    // Unknown ids are dropped; if nothing valid is left from a non-empty list, drop l (do not switch all off).
    if (l === "" || known.length) out.layers = LAYER_IDS.filter((id) => known.includes(id));
  }

  const v = get("v");
  if (v === "1") out.proof = true;
  else if (v === "0") out.proof = false;

  const s = pair(get("s"), INT_RE);
  const e = pair(get("e"), INT_RE);
  if (s && e) {
    out.start = s;
    out.end = e;
    const k = get("k");
    if (k !== undefined && k !== "") {
      const ids = k.split(".");
      if (ids.every((id) => STOP_RE.test(id)) && new Set(ids).size === ids.length) out.stops = ids;
    }
    const hz = get("h");
    if (hz === "1") out.useHazard = true;
    else if (hz === "0") out.useHazard = false;
  }
  return out;
}

/** decodeState(location.hash), or null when the page was opened without a (valid) state hash. */
export function readInitialState() {
  const hash = typeof location !== "undefined" ? location.hash : "";
  const st = decodeState(hash);
  return Object.keys(st).length ? st : null;
}

/**
 * Adds the "Copy link to this view" button + a polite status line to `container`.
 * getState() -> state object (see top). applyState is not called here: the caller applies
 * readInitialState() once, after the route and the controls exist (kept in the signature for symmetry).
 * Returns { destroy() }.
 */
export function initShare(map, { getState, applyState, container } = {}) {
  void map; void applyState;
  if (!container || typeof getState !== "function") return { destroy() {} };
  const wrap = document.createElement("div");
  wrap.className = "share-tools";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "share-btn";
  btn.innerHTML = '<span aria-hidden="true">🔗</span> Copy link to this view';
  btn.title = "Copies a link that reopens this map view (point, zoom, layers). Holds map state only.";
  const status = document.createElement("p");
  status.className = "share-status muted";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = true;
  input.className = "share-url";
  input.setAttribute("aria-label", "Link to this view");
  input.hidden = true;
  wrap.append(btn, status, input);
  container.append(wrap);

  let timer = null;
  const say = (text, keep = false) => {
    status.textContent = text;
    clearTimeout(timer);
    if (!keep) timer = setTimeout(() => { status.textContent = ""; }, 4000);
  };
  const fallback = (url) => {
    input.value = url;
    input.hidden = false;
    input.focus();
    input.select();
    say("Copy the link above with Ctrl+C (or Cmd+C).", true);
  };

  const onClick = async () => {
    let enc = "";
    try { enc = encodeState(getState() || {}); } catch (err) { console.warn("Share: could not read the view", err); }
    // Only here does the hash change (no history spam): replace, never push, never reload.
    const base = location.pathname + location.search;
    history.replaceState(history.state, "", enc ? base + "#" + enc : base);
    const url = location.href;
    input.value = url;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        input.hidden = true;
        say("Link copied");
        return;
      } catch { /* not allowed (no secure context / permission): show the URL instead */ }
    }
    fallback(url);
  };
  btn.addEventListener("click", onClick);

  return {
    destroy() {
      clearTimeout(timer);
      btn.removeEventListener("click", onClick);
      wrap.remove();
    },
  };
}
