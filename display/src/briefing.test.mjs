// Written with AI assistance (Claude).
// node --test display/src/briefing.test.mjs   (DOM-free, no deps)
// Numbers: the card rounds exactly like the side panel (panel.js num(): length 0 decimals, minutes/degrees 1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { briefingHtml, DISCLAIMER, NOT_YET } from "./briefing.js";
import { parseCsv } from "./stop-cards.js";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const json = (p) => JSON.parse(readFileSync(join(repo, p), "utf8"));
const route = json("pipeline/fallback/route.json");
const win = json("pipeline/fallback/window.json");
const manifest = json("terrain/out/layers.manifest.json");
const photos = json("display/src/stop-photos.json").photos;
const [head, ...rows] = parseCsv(readFileSync(join(repo, "science/conditions.csv"), "utf8"));
const conditions = rows.map((r) => Object.fromEntries(head.map((h, k) => [h, r[k]])));
const slopeLimit = { value: 25, unit: "degrees", note: "assumption" };
const base = { route, stops: route.properties.stops, photos, win, conditions, slopeLimit, manifest, isSample: false };
const p = route.properties;

test("route summary numbers are the route.json values, rounded like the panel", () => {
  const html = briefingHtml(base);
  assert.ok(html.includes(`${p.length_m.toFixed(0)} m`), "length_m");
  assert.ok(html.includes(`${p.margin_min.toFixed(1)} min`), "margin_min");
  assert.ok(html.includes(`${p.slope_max_deg.toFixed(1)}°`), "slope_max_deg");
  assert.ok(html.includes(`${p.time_out_min.toFixed(1)} min`) && html.includes(`${p.time_back_min.toFixed(1)} min`));
  assert.ok(html.includes("Walk-back margin (minimum along the route)"));
  assert.ok(html.includes(p.legs.map((l) => `<td>${l.length_m.toFixed(0)} m</td>`).join("")), "leg lengths in order");
  assert.ok(html.includes(p.legs.map((l) => `<td>${l.time_min.toFixed(1)} min</td>`).join("")), "leg times in order");
});

test("stop ids appear in route order", () => {
  const html = briefingHtml(base);
  const order = p.legs.map((l) => l.to).filter((id) => id !== "END");
  const orderLine = /Stop order:<\/strong> ([^<]*)</.exec(html)[1];
  assert.equal(orderLine, ["START", ...order, "END"].join(" → "));
  const list = html.slice(html.indexOf('class="bf-stops"'));
  const pos = p.stops.map((s) => list.indexOf(`<span class="bf-id">${s.id}</span>`));
  assert.ok(pos.every((x) => x >= 0), "every stop listed");
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, "stops in route.json order");
});

test("slope limit shown only when given", () => {
  assert.ok(briefingHtml(base).includes("of 25° limit (assumption)"));
  assert.ok(!briefingHtml({ ...base, slopeLimit: null }).includes("limit ("));
  assert.ok(!briefingHtml({ ...base, slopeLimit: null }).includes("° limit"));
});

test("planner labels: stand-in badge, model_version, SAMPLE", () => {
  // stand-in badge: the fallback route is the AI planner's since D28, so test the badge on a stand-in copy
  const standin = { ...route, properties: { ...p, model_version: "standin-basic-v1" } };
  assert.ok(briefingHtml({ ...base, route: standin }).includes("stand-in planner"));
  const html = briefingHtml(base);
  assert.equal(html.includes("stand-in planner"), p.model_version.startsWith("standin-"));
  assert.ok(html.includes(p.model_version) && html.includes(p.plan_id) && html.includes(p.created_at));
  assert.ok(!html.includes(">SAMPLE<"));
  const s = { ...route, properties: { ...p, plan_id: "SAMPLE-1", model_version: "team-v2" } };
  const sh = briefingHtml({ ...base, route: s });
  assert.ok(sh.includes(">SAMPLE<") && !sh.includes("stand-in planner"));
});

test("photos with credit when real data, none when isSample", () => {
  const html = briefingHtml(base);
  assert.ok(html.includes(`src="${photos.S1.image_url}"`));
  assert.ok(html.includes(`Perseverance ${photos.S1.camera}, sol ${photos.S1.sol} · NASA/JPL-Caltech`));
  assert.ok(html.includes("Perseverance raw images — NASA/JPL-Caltech"));
  const sample = briefingHtml({ ...base, isSample: true });
  assert.ok(!sample.includes("<img"), "no images");
  assert.ok(!sample.includes("Perseverance raw images"));
  assert.ok(sample.includes(">SAMPLE<"));
});

test("wording rules", () => {
  const html = briefingHtml(base);
  assert.ok(html.includes("model estimate, not validated"));
  assert.ok(html.includes("typical, not a forecast"));
  assert.ok(html.includes("LTST") && !/SOL time/i.test(html));
  assert.ok(html.includes("Relative signal strength (0–1)") && html.includes("signs of minerals, not proof"));
});

test("time window and conditions come from the files", () => {
  const html = briefingHtml(base);
  assert.ok(html.includes("11:00–15:00 LTST"));
  assert.ok(html.includes(`${win.one_way_light_time_min.toFixed(1)} min`));
  const inside = conditions.filter((r) => Number(r.ltst_hour) >= 11 && Number(r.ltst_hour) <= 15);
  assert.equal(inside.length, 5);
  const cells = (key) => inside.map((r) => `<td>${r[key]}</td>`).join("");
  for (const k of ["temp_c", "dust_tau", "radiation_uGy_per_day"]) assert.ok(html.includes(cells(k)), k);
  assert.ok(html.includes(inside[0].source.slice(0, 60)), "conditions source text");
  assert.ok(!html.includes("<td>-72.6</td>"), "hour 0 is outside the window");
});

test("text is escaped", () => {
  const evil = { ...p.stops[0], name: "<script>alert(1)</script>", reason: '"><img src=x onerror=alert(1)>' };
  const html = briefingHtml({ ...base, stops: [evil] });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!html.includes("<img src=x"));
});

test("footer disclaimer and site", () => {
  const html = briefingHtml(base);
  assert.ok(html.includes(DISCLAIMER));
  assert.ok(html.includes("Model estimates for planning practice, not validated astronaut safety guidance. Printed from https://phobos-display.vercel.app"));
});

test("missing pieces say not available yet", () => {
  const html = briefingHtml({ ...base, win: null });
  assert.ok(html.includes(`EVA time window (window.json): ${NOT_YET}`));
  assert.ok(!html.includes("<td>-34.1</td>"));
  const empty = briefingHtml({});
  assert.ok(empty.includes(NOT_YET));
  assert.ok(empty.includes(DISCLAIMER));
});

test("map image only when given", () => {
  assert.ok(!briefingHtml(base).includes("Route overview"));
  assert.ok(briefingHtml({ ...base, mapImageUrl: "data:image/png;base64,AAAA" }).includes('src="data:image/png;base64,AAAA"'));
  assert.ok(!briefingHtml({ ...base, mapImageUrl: "javascript:alert(1)" }).includes("javascript:"));
});
