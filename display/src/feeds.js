// Written with AI assistance (Claude).
// "Data feeds" card (run 2, Phase 4): context feeds fetched at BUILD time by pipeline/fetch_feeds.py into
// pipeline/feeds/*.json, copied to public/data/feeds/ (no API key in the browser). Each file:
// {source, url_without_key, fetched_utc, licence, data}. Every value shown is read from those files, with its fetch date.
// Earth-side measurements are labelled as measured near Earth / Sun activity, never as conditions at Jezero.
// Pure helpers are unit-tested in feeds.test.mjs. Track [P3] (change by Ramish, logged).

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const day = (iso) => String(iso || "").slice(0, 10);
export const FEED_NAMES = ["horizons", "donki", "noaa_kp", "usgs_names"];

/** "Light delay today" from Horizons: minutes, date, distance. null if missing. */
export function lightToday(h) {
  const t = h?.data?.today;
  if (!t || !Number.isFinite(t.one_way_light_time_min)) return null;
  return { min: t.one_way_light_time_min, au: t.delta_au, utc: t.utc, fetched: day(h.fetched_utc) };
}

const DONKI_LABEL = { FLR: "solar flare", SEP: "solar energetic particles", CME: "coronal mass ejection", IPS: "interplanetary shock",
  MPC: "magnetopause crossing", GST: "geomagnetic storm (Earth)", RBE: "radiation belt enhancement (Earth)", Report: "weekly report" };
/** Counts by type for the DONKI cache, largest first. */
export function sunActivity(d) {
  const list = d?.data?.notifications;
  if (!Array.isArray(list)) return null;
  const counts = {};
  for (const n of list) counts[n.messageType] = (counts[n.messageType] || 0) + 1;
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} × ${DONKI_LABEL[k] || k}`);
  return { total: list.length, start: d.data.start, end: d.data.end, text: parts.join(", ") || "no notifications", fetched: day(d.fetched_utc) };
}

/** Latest planetary Kp (NOAA). */
export function kpLatest(k) {
  const rows = k?.data?.rows;
  const r = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
  const v = r ? Number(r.Kp ?? r.kp ?? r[1]) : NaN;
  return Number.isFinite(v) ? { kp: v, time: String(r.time_tag ?? r[0] ?? ""), fetched: day(k.fetched_utc) } : null;
}

/** Named features near the walking area (USGS/IAU), closest first. */
export function namesNear(u, n = 6) {
  const f = u?.data?.features;
  if (!Array.isArray(f)) return null;
  return { list: f.slice(0, n), inside: f.filter((x) => x.inside_walking_area).length, radius: u.data.radius_km, fetched: day(u.fetched_utc) };
}

/** HTML for the card (empty state when no feed file is present). Pure. */
export function feedsCardHtml(feeds) {
  const L = lightToday(feeds.horizons), S = sunActivity(feeds.donki), K = kpLatest(feeds.noaa_kp), N = namesNear(feeds.usgs_names);
  const row = (title, value, note, feed) => `<div class="feed-row"><div class="feed-head"><b>${esc(title)}</b><span class="muted">fetched ${esc(day(feed?.fetched_utc))}</span></div>
      <div class="feed-val">${value}</div><p class="muted">${note} Source: ${esc(feed?.source)} · ${esc(feed?.licence)}</p></div>`;
  const rows = [];
  if (L) rows.push(row("Light delay today (Earth → Mars, one way)", `${L.min.toFixed(1)} min <span class="muted">· ${L.au.toFixed(3)} AU · ${esc(L.utc)} UTC</span>`,
    "Today's real distance. The plan itself uses the delay on its planning date (Time window card).", feeds.horizons));
  if (S) rows.push(row("Sun activity (measured near Earth/Sun)", `${S.total} notifications, ${esc(S.start)} to ${esc(S.end)}`,
    `${esc(S.text)}. Context for radiation risk only; not a reading at Jezero.`, feeds.donki));
  if (K) rows.push(row("Geomagnetic Kp index (measured near Earth)", `Kp ${K.kp} <span class="muted">· ${esc(K.time)} UTC</span>`,
    "Earth's magnetic activity; supplementary context, not Mars conditions.", feeds.noaa_kp));
  if (N) rows.push(row(`Named features within ${N.radius} km (IAU)`, N.list.map((x) => `${esc(x.name)} <span class="muted">${x.distance_km_from_walk_centre} km</span>`).join(" · "),
    N.inside ? `${N.inside} inside the walking area.` : "None lies inside the 1.5 km walking area; distances from its centre.", feeds.usgs_names));
  return `<h3>Data feeds</h3>${rows.length ? rows.join("") : `<p class="muted">No feed files in this build (run pipeline/fetch_feeds.py). The map does not need them.</p>`}`;
}

/** Loads whatever feed files exist (missing ones are simply absent). */
export async function loadFeeds(getJson, base = "feeds/") {
  const out = {};
  await Promise.all(FEED_NAMES.map(async (n) => { const j = await getJson(base + n + ".json"); if (j?.data) out[n] = j; }));
  return out;
}
