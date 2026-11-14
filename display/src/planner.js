// Written with AI assistance (Claude).
// Live planner client (D17): click start + end on the map, POST {VITE_PLANNER_URL}/plan, get a route.json back.
// The reply is drawn as-is by the caller (onRoute); this module never computes or changes any route number.
// If the planner is missing, fails, or takes longer than PLAN_TIMEOUT_MS (10 s, agreed with P5), the caller keeps the saved demo route.
// Contract: contracts/plan.request.schema.json. Frame helpers: ./frame.js (not edited here).
import L from "leaflet";
import "./planner.css";
import { checkRoute } from "./route.js";

export const PLAN_FRAME = "jezero-local-v1";
const PLAN_KEYS = ["frame", "start", "end", "stops", "use_hazard"];

/** Leaflet CRS.Simple latlng ({lat, lng} or [lat, lng], grid cells) -> local metres [x, y]. Inverse of f.localToLeaflet. */
export function leafletToLocal(f, latlng) {
  const lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
  const lng = Array.isArray(latlng) ? latlng[1] : latlng.lng;
  return [lng * f.cell, (lat - f.height) * f.cell];
}

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v));

/** Builds the POST /plan body with exactly the contract keys. Throws TypeError if the inputs don't fit the contract. */
export function buildPlanRequest({ start, end, stops, useHazard = true }) {
  if (!isPoint(start)) throw new TypeError("start must be [x, y] (two finite numbers, local metres)");
  if (!isPoint(end)) throw new TypeError("end must be [x, y] (two finite numbers, local metres)");
  const ids = stops ?? [];
  if (!Array.isArray(ids) || !ids.every((s) => typeof s === "string")) throw new TypeError("stops must be an array of stop id strings");
  if (new Set(ids).size !== ids.length) throw new TypeError("stops must not repeat an id");
  if (typeof useHazard !== "boolean") throw new TypeError("useHazard must be a boolean");
  return { frame: PLAN_FRAME, start: [start[0], start[1]], end: [end[0], end[1]], stops: [...ids], use_hazard: useHazard };
}

/** True if the reply looks like a route.json: GeoJSON Feature, LineString geometry, properties.per_vertex. */
function looksLikeRoute(r) {
  return r?.type === "Feature" && r.geometry?.type === "LineString" && Array.isArray(r.geometry.coordinates)
    && r.properties && typeof r.properties.per_vertex === "object" && r.properties.per_vertex !== null;
}

/**
 * POSTs the body to url + "/plan". Never throws.
 * -> { ok: true, route } | { ok: false, reason: "no-url" | "timeout" | "http-<status>" | "network" | "bad-reply" }
 */
// How long to wait for the planner before falling back to the saved route. Agreed with Ramish (P5): 10 s, because the
// free Render server can take a few seconds (a new 5-stop route took ~7 s before his caching fix).
export const PLAN_TIMEOUT_MS = 10000;

export async function requestPlan(body, { url = import.meta.env?.VITE_PLANNER_URL, timeoutMs = PLAN_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  if (!url || typeof url !== "string") return { ok: false, reason: "no-url" };
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  try {
    let res;
    try {
      res = await fetchImpl(url.replace(/\/+$/, "") + "/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch {
      return { ok: false, reason: timedOut ? "timeout" : "network" };
    }
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    let route;
    try { route = await res.json(); } catch { return { ok: false, reason: timedOut ? "timeout" : "bad-reply" }; }
    if (!looksLikeRoute(route)) return { ok: false, reason: "bad-reply" };
    return { ok: true, route };
  } finally {
    clearTimeout(timer);
  }
}

export const STATUS = {
  start: "Click the start point",
  end: "Click the end point",
  planning: "Planning… (free server, can take a few seconds)",
  done: "New route from planner",
  outside: "Click inside the map area",
  fallback: (reason) => `Planner unavailable (${reason}) — showing the saved demo route`,
};

const pin = (cls, label) => L.divIcon({ className: `planner-pin ${cls}`, html: label, iconSize: [22, 22], iconAnchor: [11, 11] });

/**
 * Adds the "Plan a route" control (top-left, under the zoom buttons).
 * stops: [{id, name}]. onRoute(route, {source:"planner"}) or onRoute(null, {source:"fallback", reason}). onStatus(text).
 * Returns { destroy() }.
 */
export function initPlannerControl(map, f, { stops = [], onRoute = () => {}, onStatus = () => {} } = {}) {
  let phase = "idle"; // idle | start | end | planning
  let start = null, end = null, startMarker = null, endMarker = null;
  let requestId = 0; // ignores replies to a request the user has since cleared or replaced
  let destroyed = false;

  const root = L.DomUtil.create("div", "leaflet-control planner-control");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Route planner");
  L.DomEvent.disableClickPropagation(root);
  L.DomEvent.disableScrollPropagation(root);

  const toggle = L.DomUtil.create("button", "planner-toggle", root);
  toggle.type = "button";
  toggle.textContent = "Plan a route";
  toggle.setAttribute("aria-pressed", "false");

  const opts = L.DomUtil.create("fieldset", "planner-options", root);
  const legend = L.DomUtil.create("legend", "", opts);
  legend.textContent = "Stops to visit";
  const stopBoxes = [];
  for (const s of stops) {
    const lab = L.DomUtil.create("label", "planner-check", opts);
    const box = L.DomUtil.create("input", "", lab);
    box.type = "checkbox";
    box.checked = true;
    box.value = String(s.id);
    lab.append(` ${s.id}${s.name ? " · " + s.name : ""}`);
    stopBoxes.push(box);
  }
  if (!stops.length) L.DomUtil.create("p", "planner-muted", opts).textContent = "No stops listed (direct route)";

  const hazLab = L.DomUtil.create("label", "planner-check planner-hazard", root);
  const hazBox = L.DomUtil.create("input", "", hazLab);
  hazBox.type = "checkbox";
  hazBox.checked = true;
  hazLab.append(" Use AI hazard");

  const status = L.DomUtil.create("p", "planner-status", root);
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const clear = L.DomUtil.create("button", "planner-clear", root);
  clear.type = "button";
  clear.textContent = "Clear";

  const setStatus = (text) => { status.textContent = text; onStatus(text); };

  const listen = (on) => {
    if (on) map.on("click", onMapClick); else map.off("click", onMapClick);
    map.getContainer().classList.toggle("planner-picking", on);
  };
  const setPhase = (p) => {
    phase = p;
    const picking = p === "start" || p === "end";
    toggle.setAttribute("aria-pressed", String(p !== "idle"));
    toggle.classList.toggle("active", p !== "idle");
    root.classList.toggle("expanded", p !== "idle"); // options only while planning, so the map stays visible
    listen(picking);
  };
  const removeMarkers = () => {
    startMarker?.remove(); endMarker?.remove();
    startMarker = endMarker = null; start = end = null;
  };

  async function send() {
    setPhase("planning");
    setStatus(STATUS.planning);
    const id = ++requestId;
    const body = buildPlanRequest({
      start, end, stops: stopBoxes.filter((b) => b.checked).map((b) => b.value), useHazard: hazBox.checked,
    });
    let res = await requestPlan(body);
    if (destroyed || id !== requestId) return;
    if (res.ok) {
      const err = checkRoute(res.route, f); // reply must belong to this grid before anyone draws it
      if (err) { console.warn("Planner reply not usable on this grid:", err); res = { ok: false, reason: "bad-reply" }; }
    }
    setPhase("idle");
    if (res.ok) { setStatus(STATUS.done); onRoute(res.route, { source: "planner", request: body }); }
    else { setStatus(STATUS.fallback(res.reason)); onRoute(null, { source: "fallback", reason: res.reason }); }
  }

  function onMapClick(e) {
    const [x, y] = leafletToLocal(f, e.latlng);
    if (!f.inside(x, y)) { setStatus(STATUS.outside); return; }
    const ll = f.localToLeaflet(x, y);
    if (phase === "start") {
      start = [x, y];
      startMarker = L.marker(ll, { icon: pin("planner-start", "A"), keyboard: false, interactive: false }).addTo(map);
      setPhase("end");
      setStatus(STATUS.end);
    } else if (phase === "end") {
      end = [x, y];
      endMarker = L.marker(ll, { icon: pin("planner-end", "B"), keyboard: false, interactive: false }).addTo(map);
      send();
    }
  }

  function onToggle() {
    if (phase === "planning") return;
    if (phase === "idle") { removeMarkers(); setPhase("start"); setStatus(STATUS.start); }
    else { removeMarkers(); setPhase("idle"); setStatus(""); }
  }
  function onClear() {
    requestId++; // drop any reply still in flight
    removeMarkers();
    setPhase("idle");
    setStatus("");
  }
  L.DomEvent.on(toggle, "click", onToggle);
  // Keyboard: while picking, Enter on the focused map picks the map centre (pan there with the arrow keys first).
  const onKey = (e) => {
    if (e.key === "Enter" && (phase === "start" || phase === "end") && e.target === map.getContainer()) {
      e.preventDefault();
      onMapClick({ latlng: map.getCenter() });
    }
  };
  map.getContainer().addEventListener("keydown", onKey);
  L.DomEvent.on(clear, "click", onClear);

  const Ctl = L.Control.extend({ options: { position: "topleft" }, onAdd: () => root, onRemove: () => {} });
  const control = new Ctl().addTo(map); // added after the zoom control, so it sits under it

  return {
    destroy() {
      destroyed = true;
      listen(false);
      removeMarkers();
      L.DomEvent.off(toggle, "click", onToggle);
      map.getContainer().removeEventListener("keydown", onKey);
      L.DomEvent.off(clear, "click", onClear);
      control.remove();
    },
  };
}
