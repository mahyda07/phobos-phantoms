// Written with AI assistance (Claude).
// Science stop cards for the side panel: id + name, a real Perseverance rover photo (hotlinked, NASA/JPL-Caltech),
// the reason, the relative signal strength (0–1, CRISM browse products) and the source. Replaces panel.js renderStops/highlightStop.
// Pure helpers (parseCsv, stopsFromCsv, cardHtml, signalSummary) need no DOM, so they run under `node --test`.

const CREDIT = "NASA/JPL-Caltech";

// Styles: a <link> added once at runtime. Vite turns new URL(..., import.meta.url) into a served asset;
// in Node (tests) there is no document, so nothing happens.
function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById("stop-cards-css")) return;
  const link = document.createElement("link");
  link.id = "stop-cards-css";
  link.rel = "stylesheet";
  link.href = new URL("./stop-cards.css", import.meta.url).href;
  document.head.appendChild(link);
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** RFC 4180 CSV: quoted fields may hold commas, newlines and "" for a quote. Returns rows of strings. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  const s = String(text).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const filled = (v) => v != null && String(v).trim() !== "" && Number.isFinite(Number(v));

/**
 * stops.csv (contracts/csv.md) -> [{id, name, x, y, reason, science_value, citation, location_note, positionFrom}]
 * Position: row/col cell centre when both are filled, else lat/lon_e via the frame (positionFrom "latlon").
 */
export function stopsFromCsv(csvText, f) {
  const [header, ...rows] = parseCsv(csvText);
  const h = header.map((k) => k.trim());
  return rows.map((r) => {
    const o = Object.fromEntries(h.map((k, i) => [k, (r[i] ?? "").trim()]));
    let x, y, positionFrom;
    if (filled(o.row) && filled(o.col)) {
      [x, y] = f.gridToLocal(Number(o.row) + 0.5, Number(o.col) + 0.5);
      positionFrom = "grid";
    } else {
      [x, y] = f.lonLatToLocal(Number(o.lon_e), Number(o.lat));
      positionFrom = "latlon";
    }
    return {
      id: o.id, name: o.name, x, y, reason: o.reason,
      science_value: filled(o.science_value) ? Number(o.science_value) : null,
      citation: o.source, location_note: o.location_note, positionFrom,
    };
  });
}

// Area-level wording agreed by the team (Ramish's review of Mahida's CRISM work). No per-stop strong/weak
// classes: no thresholds exist for that, so the per-stop numbers are shown only as written in `reason`.
export const AREA_SIGNAL_NOTE = "Across this walking area: carbonate and olivine strong, clay weak";

// Escape, then turn http(s) URLs into links (trailing punctuation stays outside the link).
function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, (u) => {
    const m = u.match(/^(.*?)([.,;:)]*)$/);
    return `<a href="${m[1]}" target="_blank" rel="noopener">${m[1]}</a>${m[2]}`;
  });
}

const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? "")) ? String(u) : "");

/** One card as an HTML string (all text escaped). */
export function cardHtml(stop, photo) {
  const p = photo || null;
  const imgUrl = safeUrl(stop.photo_url) || safeUrl(p?.image_url);
  const fromRoute = !!safeUrl(stop.photo_url) && stop.photo_url !== p?.image_url;
  let fig;
  if (imgUrl) {
    const href = fromRoute ? imgUrl : safeUrl(p?.page_url) || imgUrl;
    const credit = fromRoute ? stop.photo_credit || CREDIT : CREDIT;
    const caption = !fromRoute && p
      ? `Perseverance ${esc(p.camera)}, sol ${esc(p.sol)} · ${esc(credit)}`
      : `Photo · ${esc(credit)}`;
    const note = !fromRoute && p?.note ? `<span class="stop-photo-note">${esc(p.note)}</span>` : "";
    fig = `<figure class="stop-photo">
      <a href="${esc(href)}" target="_blank" rel="noopener"><img src="${esc(imgUrl)}" alt="${esc(`Rover photo near stop ${stop.id}`)}" loading="lazy" decoding="async"></a>
      <figcaption><a href="${esc(href)}" target="_blank" rel="noopener">${caption}</a>${note}</figcaption>
    </figure>`;
  } else {
    fig = `<p class="stop-nophoto">No rover photo for this stop yet</p>`;
  }
  const v = typeof stop.science_value === "number" && Number.isFinite(stop.science_value) ? stop.science_value : null;
  const sig = v != null
    ? `<p class="stop-signal">Relative signal strength <strong>${v.toFixed(2)}</strong> (0–1) · orbital CRISM data shows signs of minerals, not proof</p>`
    : "";
  const src = stop.citation ? `<p class="stop-source">Source: ${linkify(stop.citation)}</p>` : "";
  return `<article class="stop-card sc-card" data-id="${esc(stop.id)}" tabindex="0" role="button" aria-label="${esc(`Stop ${stop.id}: ${stop.name}`)}">
    <h3><span class="badge">${esc(stop.id)}</span> ${esc(stop.name)}</h3>
    ${fig}
    ${stop.reason ? `<p class="stop-reason">${esc(stop.reason)}</p>` : ""}
    ${sig}
    ${src}
  </article>`;
}

/** Render all cards into container; clicking a card (not its links) or Enter calls onSelect(id). */
export function renderStopCards(container, stops, photos, { onSelect } = {}) {
  ensureStyles();
  const list = stops || [];
  if (!list.length) { container.innerHTML = `<p class="muted">No stops in this route.</p>`; return; }
  container.innerHTML = list.map((s) => cardHtml(s, photos?.[s.id])).join("");
  container.querySelectorAll(".sc-card").forEach((c) => {
    const go = () => onSelect?.(c.dataset.id);
    c.addEventListener("click", (e) => { if (!e.target.closest("a")) go(); });
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === c) { e.preventDefault(); go(); } });
  });
}

/** Mark the card with this id active and scroll it into view. */
export function highlightStopCard(container, id) {
  let active = null;
  container.querySelectorAll(".sc-card").forEach((c) => {
    const on = c.dataset.id === id;
    c.classList.toggle("active", on);
    if (on) active = c;
  });
  active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
