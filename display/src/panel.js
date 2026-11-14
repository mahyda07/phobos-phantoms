// Written with AI assistance (Claude).
// Side panel: route summary, "at this point" readout (same fields as the headset visor), time window, stops.
// Shows numbers exactly as the files give them; rounding is for display only.
import { RAMP_CSS } from "./route.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "unavailable");
const hhmm = (h) => (typeof h === "number" ? `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}` : "unavailable");
const stat = (label, value, unit = "", cls = "") =>
  `<div class="stat ${cls}"><span class="label">${esc(label)}</span><span class="value">${value}<small>${esc(unit)}</small></span></div>`;

const $ = (id) => document.getElementById(id);

export function renderNoRoute(message) {
  $("route-summary").innerHTML = `<h2>Route</h2><p class="muted">${esc(message)}</p>`;
  $("readout").innerHTML = "";
  $("readout-section").hidden = true;
}

export function renderRouteSummary(route, kind, maxMargin) {
  const p = route.properties;
  const badge = kind === "sample" ? `<span class="badge sample">SAMPLE route</span>`
    : kind === "standin" ? `<span class="badge standin">stand-in planner</span>` : "";
  $("route-summary").innerHTML = `
    <h2>Route ${badge}</h2>
    <div class="stats">
      ${stat("Walk-back margin", num(p.margin_min), " min", "big")}
      ${stat("Length", num(p.length_m, 0), " m")}
      ${stat("Walk out", num(p.time_out_min), " min")}
      ${stat("Walk back", num(p.time_back_min), " min")}
      ${stat("Steepest slope", num(p.slope_max_deg), "°")}
      ${stat("Stops", (p.stops || []).length)}
    </div>
    <div class="legend">
      <span>Route colour = walk-back margin at each point</span>
      <div class="ramp" style="background:${RAMP_CSS}"></div>
      <div class="ends"><span>0 min</span><span>${num(maxMargin)} min (largest on this route)</span></div>
      <span class="muted">Continuous colour only. Go / Caution / Avoid bands come when thresholds are published.</span>
    </div>
    <p class="muted">Plan ${esc(p.plan_id)} · model ${esc(p.model_version)} · ${esc(p.created_at)}</p>`;
  $("assumptions").innerHTML = (p.assumptions || []).map((a) => `<li>${esc(a)}</li>`).join("") || `<li class="muted">none listed</li>`;
  $("readout-section").hidden = false;
}

/** The web version of the visor: values at route point i, straight from per_vertex. */
export function renderReadout(route, i, nextStop) {
  const pv = route.properties.per_vertex;
  const n = route.geometry.coordinates.length;
  $("readout").innerHTML = `
    <div class="stats">
      ${stat("Walk-back margin here", num(pv.margin_min[i]), " min", "big")}
      ${stat("Time out", num(pv.t_min[i]), " min")}
      ${stat("Slope here", num(pv.slope_deg[i]), "°")}
      ${stat("AI hazard here", num(pv.hazard[i], 2), " of 1")}
      ${stat("Next stop", nextStop ? `${esc(nextStop.id)} <span class="stop-name">${esc(nextStop.name)}</span>` : "none left")}
    </div>
    <p class="muted">Point ${i + 1} of ${n} · AI hazard is a model estimate, not validated.</p>`;
}

export function renderWindow(win) {
  const el = $("window");
  if (!win?.eva_window) { el.innerHTML = `<h2>Time window</h2><p class="muted">window.json not available yet.</p>`; return; }
  const { start_ltst, end_ltst } = win.eva_window;
  const rows = (win.ltst_hours || [])
    .map((h, k) => ({ h, sun: win.sun_elev_deg?.[k], t: win.temp_c?.[k] }))
    .filter((r) => r.h >= Math.floor(start_ltst) && r.h <= Math.ceil(end_ltst))
    .map((r) => `<tr><td>${hhmm(r.h)}</td><td>${num(r.sun)}°</td><td>${num(r.t, 0)} °C</td></tr>`).join("");
  el.innerHTML = `
    <h2>Time window</h2>
    <div class="stats">
      ${stat("EVA window (LTST)", `${hhmm(start_ltst)}–${hhmm(end_ltst)}`)}
      ${stat("Signal delay to Earth", num(win.one_way_light_time_min), " min")}
    </div>
    <table class="hours"><thead><tr><th>LTST</th><th>Sun height</th><th>Temp</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted">Typical conditions (climatology), not a forecast. ${esc(win.notes || "")}</p>`;
}


