// Written with AI assistance (Claude).
// Proof view: planned route overlaid on Perseverance's real path, plus the comparison numbers.
// RULE: this module never computes a proof number. Median / p90 / max distance from the rover path and the
// baselines come ONLY from the planner team's results.md and are shown exactly as written (escaped, not
// parsed as numbers). Without results.md the panel says so. The only other numbers shown are
// rover_path.json total_length_m and route.json length_m, as given (rounded to whole metres for display).
//
// Pure helpers (parseResultsMd, parseWaypointsCsv, proofPanelHtml) run in Node for tests, so Leaflet, the
// route ramp and the CSS are loaded only in a browser (Leaflet touches `window` when imported).

const BROWSER = typeof window !== "undefined" && typeof document !== "undefined";
const L = BROWSER ? (await import("leaflet")).default : null;
// Same red-amber-green ramp as route.js (RAMP_CSS); the fallback is only for Node tests.
let rampCss = "linear-gradient(to right, rgb(215,48,39), rgb(240,170,40), rgb(46,170,80))";
if (BROWSER) {
  await import("./proof.css");
  rampCss = (await import("./route.js")).RAMP_CSS;
}

export const ROVER_COLOR = "#7cc7ff";
export const NO_RESULTS_MSG =
  "Comparison numbers (median, p90, max distance from the rover path) will appear here when the results file from the planner team is published.";
export const NO_ROUTE_MSG = "No planned route yet — showing Perseverance's path only.";
export const SAMPLE_MSG =
  "The planned route is SAMPLE data on a synthetic grid; it cannot be compared with the real rover path.";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Display rounding only (whole metres). Anything that is not a finite number is reported as unavailable.
const metres = (v) => (typeof v === "number" && Number.isFinite(v) ? String(Math.round(v)) : null);

/** Same SAMPLE rule as route.js routeKind(). */
export function isSampleRoute(route) {
  const p = route?.properties || {};
  return /SAMPLE/.test(String(p.plan_id)) || /SAMPLE/.test(String(p.model_version));
}

// Split one markdown table line into cells, honouring escaped pipes (\|). Cells are trimmed, nothing else.
function tableCells(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; }
    else if (s[i] === "|") { cells.push(cur.trim()); cur = ""; }
    else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}
const isSeparator = (cells) => cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));

/**
 * Minimal, safe parse of results.md. Returns { title, rows: [{label, value, cells, header}], text }.
 * - title: first "# " heading (or null). Other headings become text paragraphs without the "#" marks.
 * - rows: every markdown table row, cells exactly as written. label = first cell, value = the rest joined
 *   with " | ". A table's header row (followed by |---|) is kept with header: true.
 * - text: the remaining lines as paragraphs separated by a blank line ("\n\n").
 * No number is evaluated or reformatted. The result is plain strings; escape when rendering.
 */
export function parseResultsMd(mdText) {
  const lines = String(mdText ?? "").replace(/\r\n?/g, "\n").split("\n");
  let title = null;
  const rows = [];
  const paras = [];
  let para = [];
  const flush = () => { if (para.length) { paras.push(para.join("\n")); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t.startsWith("|")) {
      flush();
      const cells = tableCells(t);
      if (isSeparator(cells)) continue;
      const next = lines[i + 1]?.trim() || "";
      const header = next.startsWith("|") && isSeparator(tableCells(next));
      rows.push({ label: cells[0] ?? "", value: cells.slice(1).join(" | "), cells, header });
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      flush();
      if (title === null && h[1].length === 1) title = h[2];
      else paras.push(h[2]);
      continue;
    }
    if (t === "") { flush(); continue; }
    para.push(t);
  }
  flush();
  return { title, rows, text: paras.join("\n\n") };
}

/** rover_waypoints.csv -> [{sol, x, y}], columns found by header name. Rows without numeric sol/x/y are skipped. */
export function parseWaypointsCsv(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const [iSol, iX, iY] = ["sol", "x", "y"].map((k) => head.indexOf(k));
  if (iSol < 0 || iX < 0 || iY < 0) return [];
  const out = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const sol = Number(c[iSol]), x = Number(c[iX]), y = Number(c[iY]);
    if ([sol, x, y].every(Number.isFinite) && c[iSol].trim() !== "") out.push({ sol, x, y });
  }
  return out;
}

function resultsHtml(resultsMd) {
  const r = parseResultsMd(resultsMd);
  const parts = [];
  if (r.title) parts.push(`<h3 class="proof-results-title">${esc(r.title)}</h3>`);
  if (r.rows.length) {
    const body = r.rows.map((row) => {
      const tag = row.header ? "th" : "td";
      return `<tr>${row.cells.map((c) => `<${tag}>${esc(c)}</${tag}>`).join("")}</tr>`;
    }).join("");
    parts.push(`<table class="proof-results">${body}</table>`);
  }
  if (r.text) parts.push(...r.text.split("\n\n").map((p) => `<p class="proof-text">${esc(p).replace(/\n/g, "<br>")}</p>`));
  parts.push(`<p class="muted">Numbers from the planner team's results file, shown exactly as written.</p>`);
  return parts.join("\n");
}

/** Pure HTML for the proof panel (tested in Node). Every value is escaped. */
export function proofPanelHtml({ rover = null, route = null, resultsMd = null } = {}) {
  const out = [`<h2>Proof vs Perseverance</h2>`];
  out.push(`<div class="proof-legend">
  <span class="proof-swatch"><span class="proof-line route" style="background:${esc(rampCss)}"></span>Planned route (colour = walk-back margin)</span>
  <span class="proof-swatch"><span class="proof-line rover" style="background:${ROVER_COLOR}"></span>Perseverance path (real)</span>
</div>`);

  if (rover) {
    const len = metres(rover.total_length_m);
    const src = rover.source ? ` (source: ${esc(rover.source)})` : "";
    out.push(`<p class="proof-fact">Perseverance path in this area: ${len !== null ? `${esc(len)} m` : "unavailable"}${src}</p>`);
    if (rover.note) out.push(`<p class="muted">${esc(rover.note)}</p>`);
  } else {
    out.push(`<p class="proof-fact">Perseverance path not loaded (rover_path.json missing).</p>`);
  }

  if (!route) {
    out.push(`<p class="proof-fact">${esc(NO_ROUTE_MSG)}</p>`);
  } else {
    const len = metres(route.properties?.length_m);
    out.push(`<p class="proof-fact">Planned route length: ${len !== null ? `${esc(len)} m` : "unavailable"}</p>`);
    if (isSampleRoute(route)) out.push(`<p class="proof-warn">${esc(SAMPLE_MSG)}</p>`);
  }

  if (typeof resultsMd === "string" && resultsMd.trim() !== "") out.push(`<div class="proof-results-box">${resultsHtml(resultsMd)}</div>`);
  else out.push(`<p class="proof-pending">${esc(NO_RESULTS_MSG)}</p>`);
  return out.join("\n");
}

/** Fills `container` (e.g. <section id="proof">) with the proof panel. */
export function renderProofPanel(container, { rover = null, route = null, resultsMd = null } = {}) {
  if (!container) return;
  container.classList.add("proof-panel");
  container.innerHTML = proofPanelHtml({ rover, route, resultsMd });
}

// Bounds of any layer: polyline/featureGroup (getBounds), marker (getLatLng) or plain layerGroup (children).
function layerBounds(layer, acc) {
  if (!layer) return acc;
  if (typeof layer.getBounds === "function") { const b = layer.getBounds(); if (b?.isValid?.()) acc.extend(b); }
  else if (typeof layer.getLatLng === "function") acc.extend(layer.getLatLng());
  else if (typeof layer.eachLayer === "function") layer.eachLayer((l) => layerBounds(l, acc));
  return acc;
}

/**
 * "Proof view" toggle (Leaflet control, top-left, below controls added before it).
 * ON: route + rover layers shown, rover line weight 5 over a dashed white halo, optional sol markers,
 * map fits both lines (padding 30). OFF: previous styles and layer visibility restored.
 * `rover` is accepted for API symmetry; drawing uses `roverLayer`. Returns { setOn(bool), destroy() }.
 */
export function initProofToggle(map, f, { rover = null, routeLayer = null, roverLayer = null, waypoints = null, onChange } = {}) {
  void rover;
  let on = false;
  let saved = null;
  let halo = null;
  const solLayer = L.layerGroup();
  for (const w of Array.isArray(waypoints) ? waypoints : []) {
    L.circleMarker(f.localToLeaflet(w.x, w.y), { radius: 3, color: ROVER_COLOR, weight: 1, fillColor: ROVER_COLOR, fillOpacity: 1 })
      .bindTooltip(`Perseverance, sol ${esc(w.sol)}`).addTo(solLayer);
  }

  let button;
  const Control = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-bar proof-toggle");
      button = L.DomUtil.create("button", "", div);
      button.type = "button";
      button.textContent = "Proof view";
      button.setAttribute("aria-pressed", "false");
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(button, "click", () => setOn(!on));
      return div;
    },
  });
  const control = new Control().addTo(map);

  function setOn(next) {
    next = Boolean(next);
    if (next === on) return;
    on = next;
    if (on) {
      saved = {
        routeOnMap: routeLayer ? map.hasLayer(routeLayer) : false,
        roverOnMap: roverLayer ? map.hasLayer(roverLayer) : false,
        roverStyle: roverLayer ? { weight: roverLayer.options.weight, dashArray: roverLayer.options.dashArray ?? null } : null,
      };
      if (routeLayer && !saved.routeOnMap) routeLayer.addTo(map);
      if (roverLayer) {
        if (!saved.roverOnMap) roverLayer.addTo(map);
        halo = L.polyline(roverLayer.getLatLngs(), { color: "#ffffff", weight: 9, opacity: 0.9, dashArray: "8 6", interactive: false }).addTo(map);
        roverLayer.setStyle({ weight: 5, dashArray: null });
        roverLayer.bringToFront();
      }
      solLayer.addTo(map);
      const b = layerBounds(roverLayer, layerBounds(routeLayer, L.latLngBounds([])));
      if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
    } else {
      solLayer.remove();
      if (halo) { halo.remove(); halo = null; }
      if (roverLayer && saved?.roverStyle) roverLayer.setStyle(saved.roverStyle);
      if (roverLayer && saved && !saved.roverOnMap) roverLayer.remove();
      if (routeLayer && saved && !saved.routeOnMap) routeLayer.remove();
      saved = null;
    }
    if (button) {
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    }
    if (typeof onChange === "function") onChange(on);
  }

  return {
    setOn,
    destroy() {
      if (on) setOn(false);
      solLayer.clearLayers();
      control.remove();
    },
  };
}
