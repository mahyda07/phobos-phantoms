// Written with AI assistance (Claude).
import test from "node:test";
import assert from "node:assert/strict";
import { lightToday, sunActivity, kpLatest, namesNear, feedsCardHtml } from "./feeds.js";

const H = { source: "JPL Horizons API", licence: "NASA/JPL", fetched_utc: "2026-11-15T07:00:00Z",
  data: { today: { utc: "2026-Nov-15 00:00", delta_au: 1.31585436923142, one_way_light_time_min: 10.94362708 } } };
const D = { source: "NASA CCMC DONKI", licence: "NASA data, public", fetched_utc: "2026-11-15T07:00:00Z",
  data: { start: "2026-10-16", end: "2026-11-15", notifications: [{ messageType: "CME" }, { messageType: "CME" }, { messageType: "RBE" }] } };
const K = { source: "NOAA SWPC", licence: "public domain", fetched_utc: "2026-11-15T07:00:00Z", data: { rows: [{ time_tag: "2026-11-15T03:00:00", Kp: 1.0 }] } };
const U = { source: "USGS/IAU Gazetteer", licence: "Public domain (USGS)", fetched_utc: "2026-11-15T07:00:00Z",
  data: { radius_km: 60, features: [{ name: "Belva", distance_km_from_walk_centre: 2.07, inside_walking_area: false }, { name: "<x>", distance_km_from_walk_centre: 9, inside_walking_area: false }] } };

test("values come straight from the feed files", () => {
  assert.deepEqual(lightToday(H), { min: 10.94362708, au: 1.31585436923142, utc: "2026-Nov-15 00:00", fetched: "2026-11-15" });
  assert.equal(sunActivity(D).text, "2 × coronal mass ejection, 1 × radiation belt enhancement (Earth)");
  assert.equal(kpLatest(K).kp, 1);
  assert.equal(namesNear(U).list[0].name, "Belva");
});
test("card: honest labels, fetch dates, escaping, empty state", () => {
  const html = feedsCardHtml({ horizons: H, donki: D, noaa_kp: K, usgs_names: U });
  for (const s of ["10.9 min", "measured near Earth/Sun", "not a reading at Jezero", "measured near Earth", "fetched 2026-11-15", "None lies inside", "&lt;x&gt;"]) assert.ok(html.includes(s), s);
  assert.ok(!html.includes("<x>"));
  assert.match(feedsCardHtml({}), /No feed files/);
  assert.equal(lightToday(null), null); assert.equal(sunActivity({}), null); assert.equal(kpLatest({ data: { rows: [] } }), null);
});
