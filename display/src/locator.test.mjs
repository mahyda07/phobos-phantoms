// Written with AI assistance (Claude).
// node --test src/locator.test.mjs   (DOM-free)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lonLatToPercent, boxCentre, locatorLabel, MARS_GLOBAL, initLocator } from "./locator.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const grid = JSON.parse(readFileSync(here("../../terrain/out/grid.json"), "utf8"));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("lonLatToPercent, -180..180 convention", () => {
  let p = lonLatToPercent(0, 0, "-180-180"); near(p.x, 50); near(p.y, 50);
  p = lonLatToPercent(180, 0, "-180-180"); near(p.x, 0); near(p.y, 50); // antimeridian wraps to the west edge
  p = lonLatToPercent(-90, 45, "-180-180"); near(p.x, 25); near(p.y, 25);
  p = lonLatToPercent(77.41, 18.45, "-180-180"); near(p.x, (77.41 + 180) / 360 * 100); near(p.y, (90 - 18.45) / 180 * 100);
});

test("lonLatToPercent, 0..360 convention", () => {
  let p = lonLatToPercent(0, 0, "0-360"); near(p.x, 0); near(p.y, 50);
  p = lonLatToPercent(180, 0, "0-360"); near(p.x, 50); near(p.y, 50);
  p = lonLatToPercent(-90, 45, "0-360"); near(p.x, 75); near(p.y, 25); // -90 E = 270 E
  p = lonLatToPercent(77.41, 18.45, "0-360"); near(p.x, 77.41 / 360 * 100); near(p.y, (90 - 18.45) / 180 * 100);
});

test("lonLatToPercent wraps longitude, clamps latitude, rejects unknown conventions", () => {
  near(lonLatToPercent(437.41, 0, "-180-180").x, lonLatToPercent(77.41, 0, "-180-180").x, 1e-9);
  near(lonLatToPercent(-282.59, 0, "0-360").x, lonLatToPercent(77.41, 0, "0-360").x, 1e-9);
  near(lonLatToPercent(0, 95).y, 0); near(lonLatToPercent(0, -95).y, 100);
  assert.throws(() => lonLatToPercent(0, 0, "east"));
});

test("boxCentre on terrain/out/grid.json = mean of its box values", () => {
  const b = grid.box_latlon;
  const c = boxCentre(b);
  near(c.lat, (b.lat_min + b.lat_max) / 2);
  near(c.lonE, (b.lon_min_e + b.lon_max_e) / 2);
  assert.equal(boxCentre(undefined), null);
  assert.equal(boxCentre({ lat_min: 1, lat_max: 2, lon_min_e: 3 }), null);
});

test("label text is built from grid.json", () => {
  const b = grid.box_latlon;
  const lat = (b.lat_min + b.lat_max) / 2, lon = (b.lon_min_e + b.lon_max_e) / 2;
  const l = locatorLabel(grid);
  assert.equal(l.title, `Jezero Crater · walking area ${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`);
  const km = (n) => +(n * grid.cell_m / 1000).toFixed(2);
  assert.equal(l.size, `(${km(grid.width)} × ${km(grid.height)} km, far too small to see at this scale)`);
  assert.equal(locatorLabel({ width: 1 }), null);
});

test("locator.js hard-codes no Jezero coordinates", () => {
  const src = readFileSync(here("./locator.js"), "utf8");
  for (const s of ["18.45", "18.46", "18.47", "77.39", "77.40", "77.41", "77.42"]) assert.ok(!src.includes(s), `found ${s} in locator.js`);
});

test("MARS_GLOBAL has every field, https URL, known convention", () => {
  for (const k of ["url", "name", "credit", "source", "licence", "lonConvention"]) assert.ok(MARS_GLOBAL[k], k);
  assert.match(MARS_GLOBAL.url, /^https:\/\/.+\.jpg$/);
  assert.ok(["0-360", "-180-180"].includes(MARS_GLOBAL.lonConvention));
});

test("initLocator: no control for sample data, missing box or missing Leaflet", () => {
  let added = 0;
  const fakeL = { Control: { extend: () => function () { this.addTo = () => { added++; return this; }; } } };
  assert.equal(typeof initLocator({}, { L: fakeL, grid, isSample: true }).destroy, "function");
  initLocator({}, { L: fakeL, grid: { ...grid, box_latlon: undefined }, isSample: false });
  initLocator({}, { L: null, grid, isSample: false });
  assert.equal(added, 0);
  initLocator({}, { L: fakeL, grid, isSample: false });
  assert.equal(added, 1);
});
