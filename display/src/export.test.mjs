// Written with AI assistance (Claude).
// node --test display/src/export.test.mjs   (DOM-free, no deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { routeToCsv, routeFileName } from "./export.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const load = (p) => JSON.parse(readFileSync(root + p, "utf8"));
const HEADER = "point,x_m,y_m,z_m,t_min,margin_min,slope_deg,hazard";

function checkCsv(route) {
  const csv = routeToCsv(route);
  assert.ok(csv.endsWith("\n") && !csv.includes("\r"));
  const rows = csv.slice(0, -1).split("\n");
  const n = route.geometry.coordinates.length;
  assert.equal(rows.length, 1 + n);
  assert.equal(rows[0], HEADER);
  for (const r of rows) assert.equal(r.split(",").length, 8, `extra/missing columns: ${r}`);
  const pv = route.properties.per_vertex;
  const rowAt = (i) => {
    const [x, y, z] = route.geometry.coordinates[i];
    return [String(i), String(x), String(y), String(z), String(pv.t_min[i]), String(pv.margin_min[i]),
      String(pv.slope_deg[i]), String(pv.hazard[i])].join(",");
  };
  for (let i = 0; i < n; i++) assert.equal(rows[i + 1], rowAt(i));
  return rows;
}

test("fallback route.json → header + N rows, values copied as String()", () => {
  const route = load("pipeline/fallback/route.json");
  const rows = checkCsv(route);
  const [x, y, z] = route.geometry.coordinates[700];
  const pv = route.properties.per_vertex;
  assert.equal(rows[701], `700,${x},${y},${z},${pv.t_min[700]},${pv.margin_min[700]},${pv.slope_deg[700]},${pv.hazard[700]}`);
});

test("samples/out/route.json also works", () => {
  const rows = checkCsv(load("samples/out/route.json"));
  // independent literal check (values read from the file by hand): 42.0 parses to 42 in JS
  assert.equal(rows[2], "1,42,-478,-2558.56,0.043,224.51,4.05,0.125");
});

test("routeToCsv does not mutate the route", () => {
  const route = load("pipeline/fallback/route.json");
  const before = JSON.stringify(route);
  routeToCsv(route);
  assert.equal(JSON.stringify(route), before);
});

test("routeToCsv rejects mismatched per_vertex", () => {
  const route = load("samples/out/route.json");
  route.properties.per_vertex.hazard.pop();
  assert.throws(() => routeToCsv(route));
  assert.throws(() => routeToCsv(null));
});

test("routeFileName sanitises plan_id", () => {
  const r = (id) => ({ properties: { plan_id: id } });
  assert.equal(routeFileName(r("standin-20261114122225"), "csv"), "marswalk-route-standin-20261114122225.csv");
  assert.equal(routeFileName(r("standin-20261114122225"), "geojson"), "marswalk-route-standin-20261114122225.geojson");
  assert.equal(routeFileName(r("SAMPLE-0001"), "csv"), "marswalk-route-sample-0001.csv");
  assert.equal(routeFileName(r("My Plan/../x\\y"), "csv"), "marswalk-route-my-plan-x-y.csv");
  assert.equal(routeFileName(r("  ÄÖ  "), "csv"), "marswalk-route-unnamed.csv");
  assert.equal(routeFileName({}, "geojson"), "marswalk-route-unnamed.geojson");
  for (const id of ["a b", "../../etc/passwd", "X:Y*?<>|", "ok-1"]) {
    assert.match(routeFileName(r(id), "csv"), /^marswalk-route-[a-z0-9-]+\.csv$/);
  }
});
