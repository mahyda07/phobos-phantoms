// Written with AI assistance (Claude).
// Printable one-page "EVA briefing card": route summary, legs, stops (with rover photos), time window, typical
// conditions, assumptions, data sources. RULE: nothing is invented or computed. Every value comes from the data
// passed in (route.json, stops, stop-photos.json, window.json, conditions.csv rows, docs/cost-model.md slope row,
// layers.manifest.json). Numbers are rounded for display exactly like the side panel (panel.js num()).
//
// briefingHtml() is pure (runs under `node --test`). briefing.css is NOT imported here (keeps tests DOM-free);
// main.js imports it.

const SITE = "https://phobos-display.vercel.app";
const CREDIT = "NASA/JPL-Caltech";
export const NOT_YET = "not available yet";
export const DISCLAIMER = "Model estimates for planning practice, not validated astronaut safety guidance.";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Same display rounding as panel.js / stop-cards.js.
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const num = (v, d = 1) => (isNum(v) ? v.toFixed(d) : "unavailable");
const hhmm = (h) => (isNum(h) ? `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}` : "unavailable");
const httpUrl = (u) => (/^https?:\/\//i.test(String(u ?? "")) ? String(u) : "");
// Map overview image: http(s), a data:image URL or a same-site relative path.
const imgUrl = (u) => {
  const s = String(u ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s) || /^blob:/i.test(s)) return s;
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? "" : s; // no javascript: etc.
};
const na = (what) => `<p class="bf-na">${esc(what)}: ${NOT_YET}.</p>`;
const section = (title, body, cls = "") => `<section class="bf-sec ${cls}"><h2>${esc(title)}</h2>${body}</section>`;

function badges(p, isSample) {
  const out = [];
  const mv = String(p?.model_version ?? "");
  if (/SAMPLE/.test(String(p?.plan_id ?? "")) || /SAMPLE/.test(mv) || isSample) out.push(`<span class="bf-badge bf-sample">SAMPLE</span>`);
  if (mv.startsWith("standin-")) out.push(`<span class="bf-badge bf-standin">stand-in planner</span>`);
  return out.join(" ");
}

function headerHtml(route, isSample) {
  const p = route?.properties;
  const meta = p
    ? `Plan ${esc(p.plan_id ?? "unavailable")} · planner model ${esc(p.model_version ?? "unavailable")} · created ${esc(p.created_at ?? "unavailable")}`
    : `Planned route: ${NOT_YET}`;
  return `<header class="bf-head">
    <h1>EVA briefing — Jezero western delta ${p || isSample ? badges(p, isSample) : ""}</h1>
    <p class="bf-meta">${meta}</p>
  </header>`;
}

function summaryHtml(route, slopeLimit) {
  const p = route?.properties;
  if (!p) return section("Route summary", na("Planned route (route.json)"));
  const limit = slopeLimit && isNum(slopeLimit.value)
    ? ` of ${esc(slopeLimit.value)}° limit${slopeLimit.note ? ` (${esc(slopeLimit.note)})` : ""}` : "";
  // One header row, one value row (compact).
  const cells = [
    ["Length", `${num(p.length_m, 0)} m`],
    ["Walk out", `${num(p.time_out_min)} min`],
    ["Walk back", `${num(p.time_back_min)} min`],
    ["Walk-back margin (minimum along the route)", `${num(p.margin_min)} min`],
    ["Steepest slope", `${num(p.slope_max_deg)}°${limit}`],
  ];
  const table = `<table class="bf-stats"><thead><tr>${cells.map(([k]) => `<th>${k}</th>`).join("")}</tr></thead>
    <tbody><tr>${cells.map(([, v]) => `<td>${v}</td>`).join("")}</tr></tbody></table>`;
  const legs = Array.isArray(p.legs) ? p.legs : [];
  const order = legs.length
    ? [legs[0].from, ...legs.map((l) => l.to)]
    : (p.stops || []).map((s) => s.id);
  const orderHtml = order.length ? `<p class="bf-order"><strong>Stop order:</strong> ${order.map(esc).join(" → ")}</p>` : "";
  // Legs as columns, values as given in route.json (panel rounding).
  const legsHtml = legs.length
    ? `<table class="bf-grid bf-legs"><thead><tr><th>Leg</th>${legs.map((l) => `<th>${esc(l.from)} → ${esc(l.to)}</th>`).join("")}</tr></thead><tbody>
        <tr><th>Length</th>${legs.map((l) => `<td>${num(l.length_m, 0)} m</td>`).join("")}</tr>
        <tr><th>Time</th>${legs.map((l) => `<td>${num(l.time_min)} min</td>`).join("")}</tr>
      </tbody></table>`
    : "";
  return section("Route summary", `${table}${orderHtml}${legsHtml}
    <p class="bf-small">AI hazard values shown in the app are a model estimate, validated on held-out terrain and Perseverance's drives (not astronaut safety).</p>`);
}

function stopHtml(s, photo, sharedCitation) {
  const v = isNum(s.science_value) ? s.science_value : null;
  const src = httpUrl(photo?.image_url);
  const fig = src
    ? `<figure class="bf-photo"><img src="${esc(src)}" alt="${esc(`Rover photo near stop ${s.id}`)}" decoding="async">
        <figcaption>Perseverance ${esc(photo.camera)}, sol ${esc(photo.sol)} · ${CREDIT}</figcaption></figure>`
    : "";
  return `<li class="bf-stop">
    ${fig}
    <div class="bf-stop-text">
      <h3><span class="bf-id">${esc(s.id)}</span> ${esc(s.name)}</h3>
      ${s.reason ? `<p>${esc(s.reason)}</p>` : ""}
      ${v != null ? `<p>Relative signal strength (0–1): <strong>${v.toFixed(2)}</strong> · signs of minerals, not proof</p>` : ""}
      ${s.citation && s.citation !== sharedCitation ? `<p class="bf-small">Source: ${esc(s.citation)}</p>` : ""}
    </div>
  </li>`;
}

function stopsHtml(stops, photos, isSample) {
  const list = Array.isArray(stops) ? stops : [];
  if (!list.length) return section("Science stops", na("Science stops"));
  const ph = isSample ? {} : photos || {};
  const anyPhoto = list.some((s) => httpUrl(ph[s.id]?.image_url));
  // The same source on every stop is printed once under the list (saves space; text unchanged).
  const shared = list.length > 1 && list[0].citation && list.every((s) => s.citation === list[0].citation) ? list[0].citation : null;
  const notes = [
    shared ? `<p class="bf-small">Source (all stops): ${esc(shared)}</p>` : "",
    anyPhoto ? `<p class="bf-small">Rover photos show terrain near the rover's position on that sol, not the exact stop. ${CREDIT}.</p>` : "",
  ].join("");
  // Notes sit in the free grid cell after an odd number of stops, else span the full width.
  const noteItem = notes ? `<li class="bf-stop-notes${list.length % 2 ? "" : " bf-span"}">${notes}</li>` : "";
  return section("Science stops", `<ul class="bf-stops">${list.map((s) => stopHtml(s, ph[s.id], shared)).join("")}${noteItem}</ul>`, "bf-stops-sec");
}

function windowHtml(win, conditions) {
  const ew = win?.eva_window;
  const notes = [];
  let w;
  if (!ew) w = na("EVA time window (window.json)");
  else {
    w = `<p><strong>EVA window:</strong> ${hhmm(ew.start_ltst)}–${hhmm(ew.end_ltst)} LTST<br><strong>Signal delay to Earth (one way):</strong> ${num(win.one_way_light_time_min)} min</p>`;
    if (win.notes) notes.push(`<p class="bf-tiny"><strong>Window:</strong> ${esc(win.notes)}</p>`);
  }
  let c;
  const rows = Array.isArray(conditions) ? conditions : [];
  if (!rows.length) c = na("Hourly conditions (conditions.csv)");
  else if (!ew) c = `<p class="bf-na">Hourly conditions for the EVA window: ${NOT_YET} (needs window.json).</p>`;
  else {
    const inside = rows.filter((r) => { const h = Number(r.ltst_hour); return Number.isFinite(h) && h >= Math.floor(ew.start_ltst) && h <= Math.ceil(ew.end_ltst); });
    const sources = [...new Set(inside.map((r) => r.source).filter(Boolean))];
    // Hours as columns (compact); values exactly as written in conditions.csv.
    const line = (label, key) => `<tr><th>${label}</th>${inside.map((r) => `<td>${esc(r[key])}</td>`).join("")}</tr>`;
    c = inside.length
      ? `<table class="bf-grid bf-cond"><thead><tr><th>LTST</th>${inside.map((r) => `<th>${hhmm(Number(r.ltst_hour))}</th>`).join("")}</tr></thead><tbody>
          ${line("Temp °C", "temp_c")}${line("Dust τ", "dust_tau")}${line("Radiation µGy/day", "radiation_uGy_per_day")}
        </tbody></table>
        ${inside.some((r) => r.estimate === "yes") ? `<p class="bf-small">Hourly values from conditions.csv, marked as estimates in the file.</p>` : ""}`
      : na("Hourly conditions inside the EVA window");
    for (const src of sources) notes.push(`<p class="bf-tiny"><strong>Conditions:</strong> ${esc(src)}</p>`);
  }
  return section("Time window (LTST) & conditions — typical, not a forecast", `<div class="bf-cols2"><div>${w}${c}</div><div>${notes.join("")}</div></div>`);
}

function assumptionsHtml(route) {
  const a = route?.properties?.assumptions;
  if (!Array.isArray(a) || !a.length) return section("Assumptions", na("Assumptions"));
  return section("Assumptions", `<ul class="bf-list bf-assume">${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
}

function sourcesHtml(manifest, isSample, photosShown) {
  if (isSample) return section("Data sources", `<p>Sample data — synthetic, not NASA data.</p>`);
  // Layers with the same licence and citation share one line (names joined; text unchanged).
  const groups = [];
  for (const l of (manifest?.layers || []).filter((x) => x && x.name)) {
    const key = `${l.licence}\u0000${l.citation}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.names.push(l.name); else groups.push({ key, names: [l.name], licence: l.licence, citation: l.citation });
  }
  const rows = groups.map((g) => `<li><strong>${g.names.map(esc).join(", ")}</strong> — ${esc(g.licence || "licence not given")} — ${esc(g.citation || "no citation given")}</li>`);
  if (photosShown) rows.push(`<li><strong>Perseverance raw images — ${CREDIT}</strong> — NASA media guidelines — https://mars.nasa.gov/mars2020/multimedia/raw-images/</li>`);
  if (!rows.length) return section("Data sources", na("Data sources (layers.manifest.json)"));
  return section("Data sources", `<ul class="bf-list bf-src">${rows.join("")}</ul>`);
}

/**
 * Pure HTML for the printed page.
 * data = { route, stops, photos, win, conditions, slopeLimit, manifest, isSample, mapImageUrl? }
 */
export function briefingHtml(data = {}) {
  const { route = null, photos = null, win = null, conditions = null, slopeLimit = null, manifest = null, isSample = false, mapImageUrl = null } = data || {};
  const stops = Array.isArray(data?.stops) && data.stops.length ? data.stops : route?.properties?.stops || [];
  const photosShown = !isSample && stops.some((s) => httpUrl(photos?.[s.id]?.image_url));
  const map = imgUrl(mapImageUrl);
  const mapHtml = map ? `<figure class="bf-map"><img src="${esc(map)}" alt="Route overview map"><figcaption>Route overview</figcaption></figure>` : "";
  return `<article class="bf-page">
    ${headerHtml(route, isSample)}
    ${mapHtml ? `<div class="bf-top">${mapHtml}${summaryHtml(route, slopeLimit)}</div>` : summaryHtml(route, slopeLimit)}
    ${stopsHtml(stops, photos, isSample)}
    ${windowHtml(win, conditions)}
    ${assumptionsHtml(route)}
    ${sourcesHtml(manifest, isSample, photosShown)}
    <footer class="bf-foot">${esc(DISCLAIMER)} Printed from ${esc(SITE)}</footer>
  </article>`;
}

// Wait until every <img> inside el has loaded or failed, or until maxMs passes.
function imagesReady(el, maxMs = 8000) {
  const imgs = [...el.querySelectorAll("img")].filter((i) => !i.complete);
  if (!imgs.length) return Promise.resolve();
  const each = imgs.map((i) => new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); }));
  return Promise.race([Promise.all(each), new Promise((r) => setTimeout(r, maxMs))]);
}

/** Adds the "Print EVA briefing" button to container. getData() returns the briefingHtml data. Returns { destroy() }. */
export function initBriefing(container, getData) {
  if (!container || typeof document === "undefined") return { destroy() {} };
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "briefing-btn";
  btn.textContent = "🖨 Print EVA briefing";
  const note = document.createElement("p");
  note.className = "briefing-note muted";
  note.textContent = "One A4 page: route, stops, time window, conditions, sources.";
  let busy = false;
  let restoreTitle = null;
  let lastHtml = null;
  const readData = () => { try { return getData?.() || {}; } catch (e) { console.error(e); return {}; } };
  // Build (or rebuild) the hidden card at the end of <body>. Unchanged HTML is kept, so images already loading stay.
  const build = (data) => {
    let el = document.getElementById("briefing-print");
    if (!el) { el = document.createElement("div"); el.id = "briefing-print"; lastHtml = null; }
    if (el !== document.body.lastElementChild) document.body.appendChild(el);
    const html = briefingHtml(data);
    if (html !== lastHtml) { el.innerHTML = html; lastHtml = html; }
    return el;
  };
  // Hover / keyboard focus on the button starts loading the photos before the click.
  const warm = () => { if (!busy) build(readData()); };
  const onAfter = () => {
    document.body.classList.remove("briefing-printing");
    if (restoreTitle != null) { document.title = restoreTitle; restoreTitle = null; }
  };
  const onClick = async () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const data = readData();
      const el = build(data);
      await imagesReady(el, 8000); // photos are 1–2 MB each from mars.nasa.gov
      const plan = data?.route?.properties?.plan_id;
      restoreTitle = document.title;
      document.title = plan ? `EVA briefing ${plan}` : "EVA briefing"; // default PDF file name
      document.body.classList.add("briefing-printing"); // print CSS shows only #briefing-print; removed on afterprint
      window.print();
    } finally {
      busy = false;
      btn.disabled = false;
    }
  };
  btn.addEventListener("click", onClick);
  btn.addEventListener("pointerenter", warm);
  btn.addEventListener("focus", warm);
  window.addEventListener("afterprint", onAfter);
  container.append(btn, note);
  return {
    destroy() {
      btn.removeEventListener("click", onClick);
      btn.removeEventListener("pointerenter", warm);
      btn.removeEventListener("focus", warm);
      window.removeEventListener("afterprint", onAfter);
      btn.remove();
      note.remove();
      document.getElementById("briefing-print")?.remove();
      document.body.classList.remove("briefing-printing");
    },
  };
}
