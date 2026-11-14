// Written with AI assistance (Claude).
// Run: node --test pipeline/frame.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { makeFrame, radiusFromProjection } from "./frame.js";

const WKT = 'PROJCS["Equirectangular Mars 2000 Sphere IAU",GEOGCS["D_Mars_2000_Sphere",DATUM["Mars_2000_(Sphere)",SPHEROID["Mars_2000_Sphere_IAU",3396190,0]]],PROJECTION["Equirectangular"]]';
const F = makeFrame({ frame: "jezero-local-v1", projection_wkt: WKT, origin_eqc: [4587712, 1094954],
  cell_m: 2, width: 750, height: 750, z_ref: -2560 });
const POINTS = { "NW corner": [0, 0], centre: [750, -750], "SE corner": [1500, -1500] };

test("radius parsed, not hard-coded", () => {
  assert.equal(radiusFromProjection(WKT), 3396190);
  assert.equal(radiusFromProjection("+proj=eqc +R=3396190"), 3396190);
});
test("lon/lat round trip under 1 cm", () => {
  for (const [name, [x, y]] of Object.entries(POINTS)) {
    const [x2, y2] = F.lonLatToLocal(...F.localToLonLat(x, y));
    assert.ok(Math.hypot(x2 - x, y2 - y) < 0.01, name);
  }
});
test("grid round trip under 1 cm", () => {
  for (const [name, [x, y]] of Object.entries(POINTS)) {
    const [x2, y2] = F.gridToLocal(...F.localToGrid(x, y));
    assert.ok(Math.hypot(x2 - x, y2 - y) < 0.01, name);
  }
});
test("corners match PLAN.md lat/lon", () => {
  let [lon, lat] = F.localToLonLat(0, 0);
  assert.ok(Math.abs(lat - 18.47254) < 1e-5 && Math.abs(lon - 77.39748) < 1e-5);
  [lon, lat] = F.localToLonLat(1500, -1500);
  assert.ok(Math.abs(lat - 18.44724) < 1e-5 && Math.abs(lon - 77.42279) < 1e-5);
});
test("leaflet: north at top; three.js axes", () => {
  assert.deepEqual(F.localToLeaflet(0, 0), [750, 0]);
  assert.deepEqual(F.localToLeaflet(1500, -1500), [0, 750]);
  assert.deepEqual(F.localToThree(10, -20, -2550), [10, 10, 20]);
});
