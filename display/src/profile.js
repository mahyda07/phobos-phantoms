// Written with AI assistance (Claude).
// Elevation profile along the planned route: height (route.json geometry z, metres on the DTM datum) against
// walking time from the start (route.json per_vertex.t_min). Both come straight from route.json; nothing is
// recomputed. One series, so no legend box: the heading names it. Hover = crosshair + tooltip + map point.

const W = 340, H = 150, PAD = { l: 44, r: 8, t: 10, b: 26 };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "Nice" axis ticks between lo and hi (about `count` of them). Pure. */
export function niceTicks(lo, hi, count = 4) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/** Index of the point whose t is closest to `t` (t is non-decreasing along the route). Pure. */
export function nearestByT(ts, t) {
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] < t) lo = mid; else hi = mid; }
  return Math.abs(ts[lo] - t) <= Math.abs(ts[hi] - t) ? lo : hi;
}

/** Scales + SVG path for the profile. Pure (no DOM), so it can be tested. */
export function profileGeometry(route) {
  const z = route.geometry.coordinates.map((c) => c[2]);
  const t = route.properties.per_vertex.t_min;
  const zMin = Math.min(...z), zMax = Math.max(...z);
  const tMax = Math.max(...t);
  const zPad = Math.max(1, (zMax - zMin) * 0.08);
  const y0 = zMin - zPad, y1 = zMax + zPad;
  const x = (v) => PAD.l + (tMax > 0 ? v / tMax : 0) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const line = z.map((v, i) => `${i ? "L" : "M"}${x(t[i]).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(t[t.length - 1]).toFixed(1)},${(H - PAD.b).toFixed(1)}L${x(t[0]).toFixed(1)},${(H - PAD.b).toFixed(1)}Z`;
  return { z, t, zMin, zMax, tMax, x, y, line, area, yTicks: niceTicks(y0, y1, 3), xTicks: niceTicks(0, tMax, 4) };
}

/**
 * Draws the profile into `container`. stops: [{id, name, vertex}] (vertex = route point index, from drawRoute).
 * onPoint(i) is the page's showPoint. Returns { setPoint(i) } to move the marker when the slider/map moves.
 */
export function renderProfile(container, route, { stops = [], onPoint = () => {}, onPreview = onPoint, onPreviewEnd = () => {} } = {}) {
  const g = profileGeometry(route);
  const n = g.z.length;
  const fmt = (v, d = 1) => Number(v).toFixed(d);
  const grid = g.yTicks.map((v) => `<line class="pf-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${g.y(v)}" y2="${g.y(v)}"/>
    <text class="pf-tick" x="${PAD.l - 4}" y="${g.y(v) + 3}" text-anchor="end">${fmt(v, 0)}</text>`).join("");
  const xt = g.xTicks.map((v) => `<text class="pf-tick" x="${g.x(v)}" y="${H - PAD.b + 13}" text-anchor="middle">${fmt(v, 0)}</text>`).join("");
  const stopMarks = stops.filter((s) => s.vertex >= 0 && s.vertex < n).map((s) => {
    const cx = g.x(g.t[s.vertex]), cy = g.y(g.z[s.vertex]);
    return `<g class="pf-stop"><circle cx="${cx}" cy="${cy}" r="4.5"/><text x="${cx}" y="${cy - 8}" text-anchor="middle">${esc(s.id)}</text></g>`;
  }).join("");

  container.innerHTML = `
    <h2>Elevation along the route</h2>
    <div class="pf-wrap">
      <svg class="pf" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Elevation profile: ${fmt(g.zMin)} to ${fmt(g.zMax)} m over ${fmt(g.tMax)} minutes of walking">
        ${grid}
        <line class="pf-axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${H - PAD.b}" y2="${H - PAD.b}"/>
        ${xt}
        <text class="pf-unit" x="${W - PAD.r}" y="${H - 2}" text-anchor="end">time from start (min)</text>
        <text class="pf-unit" x="2" y="${PAD.t - 2}">m</text>
        <path class="pf-area" d="${g.area}"/>
        <path class="pf-line" d="${g.line}"/>
        ${stopMarks}
        <line class="pf-cross" y1="${PAD.t}" y2="${H - PAD.b}" visibility="hidden"/>
        <circle class="pf-here" r="5"/>
        <rect class="pf-hit" x="${PAD.l}" y="0" width="${W - PAD.l - PAD.r}" height="${H}"/>
      </svg>
      <div class="pf-tip" hidden></div>
    </div>
    <p class="muted">Heights from route.json (USGS HiRISE elevation model, metres on the DTM datum), against walking time from route.json. Range ${fmt(g.zMin)} to ${fmt(g.zMax)} m.</p>
    <details class="pf-table"><summary>Heights at the stops (table)</summary>
      <table class="hours"><thead><tr><th>Stop</th><th>Time from start</th><th>Height</th></tr></thead><tbody>
      ${stops.filter((s) => s.vertex >= 0 && s.vertex < n).map((s) => `<tr><td>${esc(s.id)} ${esc(s.name)}</td><td>${fmt(g.t[s.vertex])} min</td><td>${fmt(g.z[s.vertex], 2)} m</td></tr>`).join("")}
      </tbody></table></details>`;

  const svg = container.querySelector("svg.pf");
  const cross = svg.querySelector(".pf-cross");
  const here = svg.querySelector(".pf-here");
  const tip = container.querySelector(".pf-tip");
  const place = (i) => {
    here.setAttribute("cx", g.x(g.t[i]));
    here.setAttribute("cy", g.y(g.z[i]));
  };
  const toIndex = (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    const tVal = ((sx - PAD.l) / (W - PAD.l - PAD.r)) * g.tMax;
    return nearestByT(g.t, Math.max(0, Math.min(g.tMax, tVal)));
  };
  const hit = svg.querySelector(".pf-hit");
  hit.addEventListener("mousemove", (ev) => {
    const i = toIndex(ev);
    const cx = g.x(g.t[i]);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
    tip.innerHTML = `<b>${fmt(g.z[i], 1)} m</b><span>${fmt(g.t[i])} min from start · point ${i + 1}</span>`;
    tip.style.left = `${(cx / W) * 100}%`;
    tip.hidden = false;
    onPreview(i); // hover previews; click (below) moves the position
  });
  hit.addEventListener("click", (ev) => onPoint(toIndex(ev)));
  hit.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; onPreviewEnd(); });
  place(0);
  return { setPoint: place };
}
