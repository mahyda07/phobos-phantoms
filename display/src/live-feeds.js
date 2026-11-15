// Written with AI assistance (Claude).
// Two optional "online only" context cards from public NASA feeds. They never change the route or its numbers.
// On Mars there is no internet: the map itself works from local files; these cards just say "not available" offline.
//  1. Perseverance MEDA weather (mars.nasa.gov public feed). NOTE: the feed stopped updating at sol 1133 (2024-04-27),
//     so the card always shows the sol and date of the values and how old they are.
//  2. NASA CCMC DONKI space-weather notifications (api.nasa.gov, NASA's public DEMO_KEY, ~10 requests/hour per visitor).
//     Mostly about Earth's surroundings: context for radiation risk, not a radiation reading at Jezero.

export const MEDA_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json&ver=1.0";
export const DONKI_URL = (start, end) =>
  `https://api.nasa.gov/DONKI/notifications?startDate=${start}&endDate=${end}&type=all&api_key=DEMO_KEY`;
const TIMEOUT_MS = 8000;

export const DONKI_TYPES = {
  FLR: "Solar flare", SEP: "Solar energetic particles", CME: "Coronal mass ejection", IPS: "Interplanetary shock",
  MPC: "Magnetopause crossing", GST: "Geomagnetic storm (Earth)", RBE: "Radiation belt enhancement (Earth)",
  Report: "Weekly space-weather report",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const safeUrl = (u) => (/^https:\/\//i.test(String(u || "")) ? String(u) : "");
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Latest sol in the MEDA feed that has at least one measured value ("--" means no value). Pure. */
export function latestMedaSol(feed) {
  const sols = Array.isArray(feed?.sols) ? feed.sols : [];
  const withData = sols.filter((s) => isNum(s.min_temp) || isNum(s.max_temp) || isNum(s.pressure));
  if (!withData.length) return null;
  return withData.reduce((a, b) => (Number(b.sol) > Number(a.sol) ? b : a));
}

/** Whole days between an ISO date (YYYY-MM-DD) and `now`. Display only. Pure. */
export function daysOld(isoDate, now = new Date()) {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 86400000)) : null;
}

/** Card HTML for the MEDA feed. Values exactly as in the feed. Pure. */
export function medaHtml(feed, now = new Date()) {
  const s = latestMedaSol(feed);
  if (!s) return `<h3>Latest MEDA weather at Jezero</h3><p class="muted">No measured values in NASA's public feed.</p>`;
  const age = daysOld(s.terrestrial_date, now);
  const v = (x, unit) => (isNum(x) ? `${esc(x)}${unit}` : "not reported");
  return `<h3>Latest MEDA weather at Jezero</h3>
    <p class="lf-age">Sol ${esc(s.sol)} · ${esc(s.terrestrial_date)}${age != null ? ` · <b>${age} days old</b>` : ""}</p>
    <div class="stats">
      <div class="stat"><span class="label">Air temperature</span><span class="value">${v(s.min_temp, "")} to ${v(s.max_temp, " °C")}</span></div>
      <div class="stat"><span class="label">Pressure</span><span class="value">${v(s.pressure, " Pa")}</span></div>
      <div class="stat"><span class="label">Sunrise / sunset (local)</span><span class="value">${esc(s.sunrise)} / ${esc(s.sunset)}</span></div>
      <div class="stat"><span class="label">Season</span><span class="value">${esc(s.season)}</span></div>
    </div>
    <p class="muted">Measured by Perseverance's MEDA station, from NASA's public weather feed, which has not been updated since this sol. Past measurements, not a forecast; the plan uses the typical conditions above.</p>`;
}

/** Card HTML for DONKI notifications (newest first, counts by type). Pure. */
export function donkiHtml(items, days) {
  const list = Array.isArray(items) ? items.slice() : [];
  list.sort((a, b) => String(b.messageIssueTime).localeCompare(String(a.messageIssueTime)));
  const counts = {};
  for (const x of list) counts[x.messageType] = (counts[x.messageType] || 0) + 1;
  const countText = Object.entries(counts).map(([k, n]) => `${n} × ${esc(DONKI_TYPES[k] || k)}`).join(" · ") || "no notifications";
  const rows = list.slice(0, 4).map((x) => {
    const url = safeUrl(x.messageURL);
    const label = esc(DONKI_TYPES[x.messageType] || x.messageType);
    const when = esc(String(x.messageIssueTime).replace("T", " ").replace("Z", " UTC"));
    return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>` : label} <span class="muted">${when}</span></li>`;
  }).join("");
  return `<h3>Sun activity, measured near Earth/Sun (last ${esc(days)} days)</h3>
    <p class="lf-age">${countText}</p>
    ${rows ? `<ul class="lf-list">${rows}</ul>` : ""}
    <p class="muted">NASA CCMC DONKI notifications. Most concern Earth's surroundings; this is context for radiation risk, not a radiation reading at Jezero.</p>`;
}

async function getJson(url, fetchImpl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(url, { signal: ctrl.signal });
    if (r.status === 429) throw Object.assign(new Error("NASA's public demo key reached its hourly limit; try again later"), { limit: true });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Per-browser cache (30 min) so reloading the page doesn't spend NASA's DEMO_KEY quota (10 requests/hour per connection).
export const CACHE_MS = 30 * 60 * 1000;
function cacheGet(key, now) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && now - v.at < CACHE_MS ? v : null;
  } catch { return null; }
}
function cacheSet(key, data, now) {
  try { localStorage.setItem(key, JSON.stringify({ at: now, data })); } catch { /* storage blocked: just no cache */ }
}
async function getJsonCached(key, url, fetchImpl, now) {
  const hit = cacheGet(key, now);
  if (hit) return { data: hit.data, cachedAt: hit.at };
  const data = await getJson(url, fetchImpl);
  cacheSet(key, data, now);
  return { data, cachedAt: null };
}
const fetchedNote = (cachedAt) =>
  cachedAt ? `<p class="muted">Fetched ${new Date(cachedAt).toISOString().slice(11, 16)} UTC (kept for 30 min to save NASA's request limit).</p>` : "";

const isoDay = (d) => d.toISOString().slice(0, 10);

/**
 * Fills `container` (a <section id="live">) with both cards. Each card loads on its own; a failure only affects that card.
 * Returns a promise that settles when both are done.
 */
export async function initLiveFeeds(container, { fetchImpl = globalThis.fetch, now = new Date(), days = 30, cachedDonki = null } = {}) {
  if (!container) return;
  container.innerHTML = `<h2>Live NASA feeds (online only)</h2>
    <p class="muted">Optional context, fetched when this page opens. On Mars the map works from local files; these cards need a connection.</p>
    <div class="lf-card" id="lf-meda"><p class="muted">Loading MEDA weather…</p></div>
    <div class="lf-card" id="lf-donki"><p class="muted">Loading space weather…</p></div>`;
  const offline = (what, err) =>
    `<h3>${what}</h3><p class="muted">Not available right now (${esc(err?.name === "AbortError" ? "timed out" : globalThis.navigator?.onLine === false ? "offline" : err?.message || "error")}). The rest of the map is unaffected.</p>`;
  const meda = container.querySelector("#lf-meda");
  const donki = container.querySelector("#lf-donki");
  const start = new Date(now.getTime() - days * 86400000);
  await Promise.all([
    getJsonCached("marswalk-meda", MEDA_URL, fetchImpl, now.getTime()).then(({ data, cachedAt }) => { meda.innerHTML = medaHtml(data, now) + fetchedNote(cachedAt); })
      .catch((e) => { meda.innerHTML = offline("Latest MEDA weather at Jezero", e); }),
    // run 2: prefer the build-time cache (pipeline/fetch_feeds.py, team key used at build time only) over a DEMO_KEY call
    (cachedDonki?.data?.notifications
      ? Promise.resolve({ data: cachedDonki.data.notifications, cachedAt: null, built: cachedDonki.fetched_utc })
      : getJsonCached("marswalk-donki", DONKI_URL(isoDay(start), isoDay(now)), fetchImpl, now.getTime()))
      .then(({ data, cachedAt, built }) => { donki.innerHTML = donkiHtml(data, days) + (built ? `<p class="muted">Fetched ${esc(String(built).slice(0, 16).replace("T", " "))} UTC at build time.</p>` : fetchedNote(cachedAt)); })
      .catch((e) => { donki.innerHTML = offline(`Space weather (last ${days} days)`, e); }),
  ]);
}
