// Written with AI assistance (Claude).
// node --test src/compare.test.mjs  (DOM-free)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareRows, compareHtml } from "./compare.js";

const base = JSON.parse(readFileSync(new URL("../../pipeline/fallback/route.json", import.meta.url), "utf8"));
const other = structuredClone(base);
Object.assign(other.properties, {
  length_m: 3911.6, time_out_min: 64.2, time_back_min: 21.5, margin_min: 151.3, slope_max_deg: 19.7,
  model_version: "team-planner-v2", plan_id: "plan-0002", created_at: "2026-11-15T10:00:00Z",
  stops: [base.properties.stops[2], base.properties.stops[0]],
});
const row = (rows, label) => rows.find((r) => r.label === label);

test("compareRows returns each route's own values exactly as given", () => {
  const rows = compareRows(base, other);
  const p = base.properties, q = other.properties;
  const pairs = { Length: "length_m", "Walk out": "time_out_min", "Walk back": "time_back_min",
    "Walk-back margin": "margin_min", "Steepest slope": "slope_max_deg", Model: "model_version", Plan: "plan_id", Created: "created_at" };
  for (const [label, key] of Object.entries(pairs)) {
    assert.strictEqual(row(rows, label).prev, p[key], label);
    assert.strictEqual(row(rows, label).next, q[key], label);
  }
  assert.strictEqual(row(rows, "Length").prev, base.properties.length_m);   // fallback route (AI planner since D28)
  assert.strictEqual(typeof row(rows, "Length").next, "number");
  assert.equal(rows.length, 9);
});

test("stop order string comes from properties.stops ids", () => {
  const rows = compareRows(base, other);
  assert.equal(row(rows, "Stops (in order)").prev, base.properties.stops.map((s) => s.id).join(" → "));
  assert.equal(row(rows, "Stops (in order)").prev, "S1 → S3 → S5 → S2 → S4");
  assert.equal(row(rows, "Stops (in order)").next, "S5 → S1");
});

test("missing fields become null", () => {
  const bare = { type: "Feature", properties: {} };
  for (const r of compareRows(bare, other)) assert.strictEqual(r.prev, null, r.label);
});

test("compareHtml escapes text, has the note, and no derived wording", () => {
  const evil = structuredClone(other);
  evil.properties.model_version = '<script>alert("x")</script>';
  const html = compareHtml(base, evil);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Each column shows that route's own numbers from its route.json; nothing is recalculated."));
  assert.ok(html.includes("<h2>Compare routes</h2>"));
  assert.ok(html.includes(base.properties.model_version) && html.includes(base.properties.created_at));
  assert.ok(html.includes("solid = new route") && html.includes("dashed grey = previous route"));
  for (const h of [html, compareHtml(base, other)]) {
    assert.ok(!h.includes("%"), "no percentages");
    assert.doesNotMatch(h, /shorter|longer|better/i);
  }
});

test("compareHtml returns empty string when a route is missing", () => {
  assert.equal(compareHtml(null, base), "");
  assert.equal(compareHtml(base, undefined), "");
});
