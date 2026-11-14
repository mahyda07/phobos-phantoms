// Written with AI assistance (Claude).
// Run: node --test display/src/proof.test.mjs   (DOM-free; no Vite, no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseResultsMd, parseWaypointsCsv, proofPanelHtml, NO_RESULTS_MSG, NO_ROUTE_MSG, SAMPLE_MSG } from "./proof.js";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rover = JSON.parse(readFileSync(join(repo, "terrain/out/rover_path.json"), "utf8"));
const sampleRoute = JSON.parse(readFileSync(join(repo, "samples/out/route.json"), "utf8"));
const csvText = readFileSync(join(repo, "terrain/out/rover_waypoints.csv"), "utf8");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const MD = `# Proof results

| metric | value |
|---|---|
| median distance | 12.34 m |
| p90 | ≈ 40 |
| max <b>bad</b> | 0.500 m \\| est. |

Baseline: straight line.
Second line of the same paragraph.

## Notes
Distances are to the nearest rover point.
`;

test("parseResultsMd keeps values exactly as written", () => {
  const r = parseResultsMd(MD);
  assert.equal(r.title, "Proof results");
  const body = r.rows.filter((x) => !x.header);
  assert.deepEqual(body.map((x) => [x.label, x.value]), [
    ["median distance", "12.34 m"], ["p90", "≈ 40"], ["max <b>bad</b>", "0.500 m | est."],
  ]);
  assert.equal(r.rows[0].header, true);
  assert.match(r.text, /Baseline: straight line\.\nSecond line/);
  assert.match(r.text, /Notes\n\nDistances are/);
});

test("results table cells are escaped and shown as written", () => {
  const html = proofPanelHtml({ rover, route: null, resultsMd: MD });
  assert.ok(html.includes("<td>12.34 m</td>"));
  assert.ok(html.includes("<td>≈ 40</td>"));
  assert.ok(html.includes("<td>p90</td>"));
  assert.ok(html.includes("max &lt;b&gt;bad&lt;/b&gt;"));
  assert.ok(!html.includes("<b>bad</b>"));
  assert.ok(!html.includes(NO_RESULTS_MSG));
});

test("rover only: path length as given, source, no-route and pending messages", () => {
  const html = proofPanelHtml({ rover, route: null, resultsMd: null });
  assert.ok(html.includes("Proof vs Perseverance"));
  assert.ok(html.includes(`Perseverance path in this area: ${Math.round(rover.total_length_m)} m`));
  assert.ok(html.includes(`(source: ${esc(rover.source)})`));
  assert.ok(html.includes(esc(rover.note)));
  assert.ok(html.includes(esc(NO_ROUTE_MSG)));
  assert.ok(html.includes(esc(NO_RESULTS_MSG)));
  assert.ok(html.includes("#7cc7ff"));
});

test("SAMPLE route: warning line and route length as given", () => {
  const html = proofPanelHtml({ rover, route: sampleRoute, resultsMd: null });
  assert.ok(html.includes(esc(SAMPLE_MSG)));
  assert.ok(html.includes(`Planned route length: ${Math.round(sampleRoute.properties.length_m)} m`));
  assert.ok(!html.includes(esc(NO_ROUTE_MSG)));
  const real = { ...sampleRoute, properties: { ...sampleRoute.properties, plan_id: "P-1", model_version: "v1" } };
  assert.ok(!proofPanelHtml({ rover, route: real }).includes(esc(SAMPLE_MSG)));
});

test("parseWaypointsCsv on the real CSV", () => {
  const rows = parseWaypointsCsv(csvText);
  const dataLines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "").length - 1;
  assert.equal(rows.length, dataLines);
  for (const w of rows) {
    assert.deepEqual(Object.keys(w), ["sol", "x", "y"]);
    assert.ok([w.sol, w.x, w.y].every(Number.isFinite));
  }
  const first = csvText.split(/\r?\n/)[1].split(",");
  assert.deepEqual(rows[0], { sol: Number(first[0]), x: Number(first[3]), y: Number(first[4]) });
});
