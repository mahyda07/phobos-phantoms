// Written with AI assistance (Claude).
// Per-stretch proof table: one row per ~500 m stretch of Perseverance's real track (results.json "stretches").
// RULE: this module never computes a proof number. Every value is shown exactly as given in results.json
// (String(value), escaped). Sorting only reorders rows. Pure helpers (COLUMNS, stretchesTableHtml, sortRows)
// run in Node for tests; the CSS (proof-stretches.css) is imported by main.js, not here.

export const COLUMNS = [
  { key: "sols", label: "Sols", unit: "" },
  { key: "rover_m", label: "Rover track (m)", unit: "m" },
  { key: "plan_m", label: "Our route (m)", unit: "m" },
  { key: "straight_m", label: "Straight line (m)", unit: "m" },
  { key: "plan_median_m", label: "Our route: median distance from track (m)", unit: "m" },
  { key: "straight_median_m", label: "Straight line: median distance from track (m)", unit: "m" },
  { key: "plan_max_m", label: "Our route: max distance from track (m)", unit: "m" },
  { key: "straight_max_m", label: "Straight line: max distance from track (m)", unit: "m" },
  { key: "rover_max_slope", label: "Rover track: steepest ground (°)", unit: "°" },
  { key: "plan_max_slope", label: "Our route: steepest ground (°)", unit: "°" },
  { key: "straight_max_slope", label: "Straight line: steepest ground (°)", unit: "°" },
];

export const CAVEAT = "A rover is not an astronaut: this checks our terrain model, not astronaut safety.";
const NOTE =
  "A stretch is about 500 m of Perseverance's real track; for each one our planner plans a route between the rover's real start and end, compared with the rover's track and with a straight line between the same points. Distances are from the rover track; slopes are the steepest ground crossed.";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Value exactly as given; missing values shown as a dash.
const cell = (v) => (v === null || v === undefined || v === "" ? "–" : String(v));

const firstNum = (s) => { const m = String(s ?? "").match(/\d+/); return m ? Number(m[0]) : NaN; };
const solParts = (s) => String(s ?? "").split(/\s*[-–]\s*/);

/** Sort comparison value: numbers as numbers, "405-408" by its first number (then the whole string). */
function cmp(a, b, key) {
  const va = a?.[key], vb = b?.[key];
  const missA = va === null || va === undefined || va === "", missB = vb === null || vb === undefined || vb === "";
  if (missA || missB) return missA === missB ? 0 : missA ? 1 : -1; // missing values always last
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  const na = firstNum(va), nb = firstNum(vb);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(va).localeCompare(String(vb), undefined, { numeric: true });
}

/** Pure, stable sort (returns a new array). dir: "asc" | "desc". Missing values stay at the end either way. */
export function sortRows(rows, key, dir = "asc") {
  const sign = dir === "desc" ? -1 : 1;
  return (Array.isArray(rows) ? rows : [])
    .map((r, i) => [r, i])
    .sort(([a, ia], [b, ib]) => {
      const va = a?.[key], vb = b?.[key];
      const missA = va === null || va === undefined || va === "", missB = vb === null || vb === undefined || vb === "";
      const c = missA || missB ? cmp(a, b, key) : sign * cmp(a, b, key);
      return c || ia - ib;
    })
    .map(([r]) => r);
}

function rowHtml(s) {
  if (s?.skipped !== undefined) {
    return `<tr class="ps-skipped"><th scope="row">${esc(cell(s.sols))}</th><td colspan="${COLUMNS.length - 1}">Skipped: ${esc(s.skipped)}</td></tr>`;
  }
  return `<tr>${COLUMNS.map((c, i) => (i === 0 ? `<th scope="row">${esc(cell(s?.[c.key]))}</th>` : `<td>${esc(cell(s?.[c.key]))}</td>`)).join("")}</tr>`;
}

function bodyHtml(rows) {
  return rows.map(rowHtml).join("");
}

/** Pure HTML for the per-stretch table (tested in Node). Returns "" if there are no stretches. */
export function stretchesTableHtml(results) {
  const rows = Array.isArray(results?.stretches) ? results.stretches : [];
  if (!rows.length) return "";
  const first = solParts(rows[0]?.sols)[0];
  const lastParts = solParts(rows[rows.length - 1]?.sols);
  const last = lastParts[lastParts.length - 1];
  const range = first && last ? `, sols ${esc(first)}–${esc(last)}` : "";
  const n = rows.length;
  const head = COLUMNS.map(
    (c) => `<th scope="col" aria-sort="none" data-key="${esc(c.key)}"><button type="button" class="ps-sort" data-key="${esc(c.key)}">${esc(c.label)}<span class="ps-arrow" aria-hidden="true"></span></button></th>`,
  ).join("");
  const planner = results?.summary?.planner;
  // "stand-in" only when the file says so (planner name starts with "standin"); the team planner's results won't be labelled that way.
  const standin = /^standin/i.test(String(planner || ""));
  const source = `results.json${standin ? " (stand-in" : planner ? " (" : ""}${standin && planner ? ", " : ""}${planner ? esc(planner) : ""}${standin || planner ? ")" : ""}`;
  return `<details class="ps">
<summary>Per stretch (${n} stretch${n === 1 ? "" : "es"}${range})</summary>
<p class="ps-note">${esc(NOTE)} ${esc(CAVEAT)}</p>
<div class="ps-scroll" tabindex="0" role="region" aria-label="Per-stretch comparison table">
<table class="ps-table">
<thead><tr>${head}</tr></thead>
<tbody>${bodyHtml(rows)}</tbody>
</table>
</div>
<p class="ps-source">Source: ${source}. Values shown exactly as in the file.</p>
</details>`;
}

/**
 * Appends the table into `container` (the #proof section) and wires the header buttons:
 * first click sorts ascending, next click on the same column toggles descending; aria-sort on the th.
 * Returns { destroy() } which removes the table and its listener.
 */
export function renderStretches(container, results) {
  const noop = { destroy() {} };
  if (!container) return noop;
  const html = stretchesTableHtml(results);
  if (!html) return noop;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const root = tpl.content.firstElementChild;
  container.appendChild(root);
  const rows = results.stretches.slice();
  const tbody = root.querySelector("tbody");
  let state = { key: null, dir: "none" };

  const onClick = (e) => {
    const btn = e.target.closest("button.ps-sort");
    if (!btn || !root.contains(btn)) return;
    const key = btn.dataset.key;
    const dir = state.key === key && state.dir === "asc" ? "desc" : "asc";
    state = { key, dir };
    tbody.innerHTML = bodyHtml(sortRows(rows, key, dir));
    root.querySelectorAll("thead th").forEach((th) => {
      th.setAttribute("aria-sort", th.dataset.key === key ? (dir === "asc" ? "ascending" : "descending") : "none");
    });
  };
  root.addEventListener("click", onClick);
  return {
    destroy() {
      root.removeEventListener("click", onClick);
      root.remove();
    },
  };
}
