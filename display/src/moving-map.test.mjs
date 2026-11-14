// Written with AI assistance (Claude).
// Tests for moving-map.js pure helpers. Run from the repo root: node --test display/src/moving-map.test.mjs
// moving-map.js imports neither Leaflet nor CSS (Leaflet is passed in as opts.L), so no loader stub is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ringRadii, ringLabel, nextIndex, metresToMapUnits } from "./moving-map.js";
import { makeFrame } from "./frame.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const grid = JSON.parse(readFileSync(path.join(here, "../../terrain/out/grid.json"), "utf8"));

test("ringRadii: 100 m steps up to 500 m", () => {
  assert.deepEqual(ringRadii(500, 100), [100, 200, 300, 400, 500]);
  assert.deepEqual(ringRadii(450, 100), [100, 200, 300, 400]);
  assert.deepEqual(ringRadii(0, 100), []);
  assert.deepEqual(ringRadii(500, 0), []);
});

test("ringLabel: metres and kilometres", () => {
  assert.equal(ringLabel(100), "100 m");
  assert.equal(ringLabel(1000), "1 km");
  assert.equal(ringLabel(1500), "1.5 km");
  assert.equal(ringLabel(500), "500 m");
});

test("nextIndex: steps forward and stops at n-1", () => {
  assert.equal(nextIndex(0, 10), 1);
  assert.equal(nextIndex(8, 10), 9);
  assert.equal(nextIndex(9, 10), 9);
  assert.equal(nextIndex(7, 10, 4), 9);
  assert.equal(nextIndex(0, 0), 0);
});

test("metresToMapUnits: 100 m ring on the 2 m grid is 50 map units", () => {
  const f = makeFrame(grid);
  assert.equal(f.cell, 2);
  assert.equal(metresToMapUnits(100, f), 50);
  assert.equal(metresToMapUnits(500, f), 250);
});
