// Written with AI assistance (Claude).
// "Compare routes": after a new plan arrives, the previous route stays on the map as a faint dashed grey line
// and the panel shows both routes' own numbers side by side. Every value is copied from each route.json's
// properties exactly as given; nothing is subtracted, divided or recalculated (display rounding only).
// No leaflet import here (keeps node tests DOM-free): the caller passes `L` and the frame helper `f`.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "unavailable");
const val = (v) => (v === undefined || v === null || v === "" ? null : v);

/** Stop ids in the order route.json lists them, e.g. "S1 → S3 → S5". null when the route has no stops list. */
function stopOrder(p) {
  if (!Array.isArray(p?.stops)) return null;
  const ids = p.stops.map((s) => s?.id).filter((id) => id !== undefined && id !== null && id !== "");
  return ids.length ? ids.map(String).join(" → ") : null;
}

// Fields shown, in order. `d` = decimals for display rounding of numbers (same as the panel uses).
const FIELDS = [
  { key: "length_m", label: "Length", unit: "m", d: 0 },
  { key: "time_out_min", label: "Walk out", unit: "min", d: 1 },
  { key: "time_back_min", label: "Walk back", unit: "min", d: 1 },
  { key: "margin_min", label: "Walk-back margin", unit: "min", d: 1 },
  { key: "slope_max_deg", label: "Steepest slope", unit: "°", d: 1 },
  { key: "stops", label: "Stops (in order)", unit: "", get: stopOrder },
  { key: "model_version", label: "Model", unit: "" },
  { key: "plan_id", label: "Plan", unit: "" },
  { key: "created_at", label: "Created", unit: "" },
];

/** Pure: one row per field with each route's value exactly as given (numbers stay numbers, missing -> null). */
export function compareRows(prev, next) {
  const pp = prev?.properties || {}, np = next?.properties || {};
  return FIELDS.map(({ key, label, unit, get }) => ({
    label, unit,
    prev: get ? get(pp) : val(pp[key]),
    next: get ? get(np) : val(np[key]),
  }));
}

const cell = (v, d) => {
  if (v === null) return `<span class="cmp-na">unavailable</span>`;
  return typeof v === "number" ? num(v, d) : esc(v);
};

/** Pure: inner HTML for <section id="compare">. "" if either route is missing. */
export function compareHtml(prev, next) {
  if (!prev?.properties || !next?.properties) return "";
  const decimals = Object.fromEntries(FIELDS.map((f) => [f.label, f.d]));
  const head = (route, title) => {
    const p = route.properties;
    return `<th scope="col">${esc(title)}<span class="cmp-meta">${esc(p.model_version ?? "model unknown")}<br>${esc(p.created_at ?? "time unknown")}</span></th>`;
  };
  const body = compareRows(prev, next).map((r) => {
    const u = r.unit ? ` <small>${esc(r.unit)}</small>` : "";
    const withUnit = (v) => (v === null ? cell(v) : cell(v, decimals[r.label]) + (typeof v === "number" ? u : ""));
    return `<tr><th scope="row">${esc(r.label)}</th><td class="cmp-prev">${withUnit(r.prev)}</td><td class="cmp-next">${withUnit(r.next)}</td></tr>`;
  }).join("");
  return `
    <h2>Compare routes</h2>
    <div class="cmp-legend">
      <span><i class="cmp-swatch solid"></i>solid = new route</span>
      <span><i class="cmp-swatch dashed"></i>dashed grey = previous route</span>
    </div>
    <table class="cmp-table">
      <thead><tr><th scope="col">Field</th>${head(prev, "Previous")}${head(next, "New")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="muted">Each column shows that route's own numbers from its route.json; nothing is recalculated.</p>`;
}

/**
 * map: Leaflet map. L: leaflet. f: frame helper (f.localToLeaflet(x, y) -> [lat, lng]).
 * container: the <section id="compare"> element (hidden until setRoutes).
 */
export function initCompare(map, { L, f, container }) {
  const PANE = "compare-prev";
  // Own pane under the overlay pane (z 400), so the dashed line always sits below the current route.
  if (!map.getPane(PANE)) {
    const pane = map.createPane(PANE);
    pane.style.zIndex = 390;
    pane.style.pointerEvents = "none";
  }
  let line = null;

  const removeLine = () => { if (line) { line.remove(); line = null; } };

  function clear() {
    removeLine();
    if (container) { container.innerHTML = ""; container.hidden = true; }
  }

  function setRoutes(prev, next) {
    removeLine();
    const html = compareHtml(prev, next);
    const coords = prev?.geometry?.coordinates;
    if (!html || !Array.isArray(coords) || coords.length < 2) { clear(); return; }
    line = L.polyline(coords.map(([x, y]) => f.localToLeaflet(x, y)), {
      pane: PANE, color: "#9aa3ad", weight: 3, opacity: 0.7, dashArray: "6 6", interactive: false,
    }).addTo(map);
    if (container) {
      container.innerHTML = html;
      // Button sits outside the <h2> so clicking it does not fold the section (welcome.js folds on h2 clicks).
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cmp-hide";
      btn.textContent = "✕ Hide previous route";
      btn.addEventListener("click", clear);
      container.querySelector("h2")?.insertAdjacentElement("afterend", btn);
      container.classList.remove("mw-collapsed"); // welcome.js collapses sections at start; open it when it fills
      container.hidden = false;
    }
  }

  function destroy() {
    clear();
    map.getPane(PANE)?.remove();
  }

  return { setRoutes, clear, destroy };
}
