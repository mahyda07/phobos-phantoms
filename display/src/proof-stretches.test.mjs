// Written with AI assistance (Claude).
// DOM-free tests: node --test display/src/proof-stretches.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COLUMNS, CAVEAT, stretchesTableHtml, sortRows } from "./proof-stretches.js";

const resultsPath = fileURLToPath(new URL("../../pipeline/fallback/results.json", import.meta.url));
const results = JSON.parse(readFileSync(resultsPath, "utf8"));

test("13 data rows with every sols string and plan_median_m as given", () => {
  const html = stretchesTableHtml(results);
  const body = html.split("<tbody>")[1].split("</tbody>")[0];
  assert.equal((body.match(/<tr[ >]/g) || []).length, 13);
  assert.equal(results.stretches.length, 13);
  for (const s of results.stretches) {
    assert.ok(html.includes(`>${s.sols}<`), `sols ${s.sols}`);
    assert.ok(html.includes(`<td>${String(s.plan_median_m)}</td>`), `plan_median_m ${s.plan_median_m}`);
    assert.ok(html.includes(`<td>${String(s.straight_max_slope)}</td>`), `straight_max_slope ${s.straight_max_slope}`);
  }
  assert.ok(html.includes("Per stretch (13 stretches, sols 405–717)"));
});

test("caveat, source, header buttons", () => {
  const html = stretchesTableHtml(results);
  assert.ok(html.includes(CAVEAT));
  assert.ok(html.includes("A rover is not an astronaut: this checks our terrain model, not astronaut safety."));
  assert.ok(html.includes(`results.json (stand-in, ${results.summary.planner})`));
  const real = stretchesTableHtml({ ...results, summary: { ...results.summary, planner: "team-v1" } });
  assert.ok(real.includes("results.json (team-v1)") && !real.includes("stand-in"));
  assert.equal((html.match(/<button type="button" class="ps-sort"/g) || []).length, COLUMNS.length);
  assert.equal((html.match(/aria-sort="none"/g) || []).length, COLUMNS.length);
});

test("escapes HTML in a fake sols value", () => {
  const html = stretchesTableHtml({ summary: { planner: "<b>x</b>" }, stretches: [{ sols: "<img src=x onerror=alert(1)>", plan_median_m: 1 }] });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!html.includes("<b>x</b>"));
});

test("sortRows by plan_median_m asc/desc", () => {
  const vals = results.stretches.map((s) => s.plan_median_m);
  const asc = sortRows(results.stretches, "plan_median_m", "asc").map((s) => s.plan_median_m);
  const desc = sortRows(results.stretches, "plan_median_m", "desc").map((s) => s.plan_median_m);
  assert.deepEqual(asc, [...vals].sort((a, b) => a - b));
  assert.deepEqual(desc, [...vals].sort((a, b) => b - a));
});

test("sortRows by sols naturally and stably; does not mutate", () => {
  const rows = [{ sols: "1000-1002" }, { sols: "99-100" }, { sols: "405-408", t: 1 }, { sols: "405-408", t: 2 }];
  const copy = rows.slice();
  assert.deepEqual(sortRows(rows, "sols", "asc").map((r) => r.sols), ["99-100", "405-408", "405-408", "1000-1002"]);
  assert.deepEqual(sortRows(rows, "sols", "asc").filter((r) => r.t).map((r) => r.t), [1, 2]);
  assert.deepEqual(sortRows(rows, "sols", "desc").map((r) => r.sols), ["1000-1002", "405-408", "405-408", "99-100"]);
  assert.deepEqual(sortRows(rows, "sols", "desc").filter((r) => r.t).map((r) => r.t), [1, 2]);
  assert.deepEqual(rows, copy);
  const real = sortRows([...results.stretches].reverse(), "sols", "asc").map((s) => s.sols);
  assert.deepEqual(real, results.stretches.map((s) => s.sols));
});

test("empty input -> empty string", () => {
  assert.equal(stretchesTableHtml({ stretches: [] }), "");
  assert.equal(stretchesTableHtml({}), "");
  assert.equal(stretchesTableHtml(null), "");
});
