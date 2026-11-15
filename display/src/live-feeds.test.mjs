// Written with AI assistance (Claude).
import test from "node:test";
import assert from "node:assert/strict";
import { latestMedaSol, daysOld, medaHtml, donkiHtml, initLiveFeeds } from "./live-feeds.js";

const FEED = { sols: [
  { terrestrial_date: "2024-04-21", sol: "1127", min_temp: "--", max_temp: "--", pressure: "--", season: "late autumn", sunrise: "06:13:15", sunset: "17:11:36" },
  { terrestrial_date: "2024-04-26", sol: "1132", min_temp: -77.9, max_temp: -23.4, pressure: 774.1, season: "late autumn", sunrise: "06:17:18", sunset: "17:13:27" },
  { terrestrial_date: "2024-04-27", sol: "1133", min_temp: -79.3, max_temp: -24.7, pressure: 778.9, season: "late autumn", sunrise: "06:18:07", sunset: "17:13:51" },
] };

test("latestMedaSol picks the newest sol with measured values", () => {
  assert.equal(latestMedaSol(FEED).sol, "1133");
  assert.equal(latestMedaSol({ sols: [FEED.sols[0]] }), null);
  assert.equal(latestMedaSol(null), null);
});

test("daysOld counts whole days", () => {
  assert.equal(daysOld("2024-04-27", new Date("2024-04-29T12:00:00Z")), 2);
  assert.equal(daysOld("bad"), null);
});

test("medaHtml shows the values as given, the sol, the date and the age", () => {
  const html = medaHtml(FEED, new Date("2026-11-15T00:00:00Z"));
  for (const s of ["Sol 1133", "2024-04-27", "-79.3", "-24.7 °C", "778.9 Pa", "not been updated", "not a forecast"]) assert.ok(html.includes(s), s);
  assert.match(html, /\d+ days old/);
});

test("donkiHtml lists newest first, counts by type, escapes, keeps only https links", () => {
  const items = [
    { messageType: "CME", messageIssueTime: "2026-11-01T10:00Z", messageURL: "https://ccmc.gsfc.nasa.gov/x/1" },
    { messageType: "RBE", messageIssueTime: "2026-11-10T10:00Z", messageURL: "javascript:alert(1)" },
    { messageType: "<b>", messageIssueTime: "2026-11-05T10:00Z", messageURL: "https://ccmc.gsfc.nasa.gov/x/2" },
  ];
  const html = donkiHtml(items, 30);
  assert.ok(html.indexOf("Radiation belt") < html.indexOf("Coronal mass ejection"), "newest first");
  assert.ok(html.includes("1 × Coronal mass ejection"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("<b>") && html.includes("&lt;b&gt;"));
  assert.ok(html.includes("not a radiation reading at Jezero"));
});

test("initLiveFeeds: a failing feed only affects its own card", async () => {
  const el = { innerHTML: "", querySelector(sel) { return (this[sel] ||= { innerHTML: "" }); } };
  globalThis.navigator ??= { onLine: true };
  const fetchImpl = async (url) => {
    if (url.includes("mars.nasa.gov")) return { ok: true, json: async () => FEED };
    throw new Error("network");
  };
  await initLiveFeeds(el, { fetchImpl, now: new Date("2026-11-15T00:00:00Z") });
  assert.ok(el["#lf-meda"].innerHTML.includes("Sol 1133"));
  assert.ok(el["#lf-donki"].innerHTML.includes("Not available right now"));
});
