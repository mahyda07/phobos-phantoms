// Written with AI assistance (Claude).
import { test } from "node:test";
import assert from "node:assert/strict";
import { stopVertexIndices, vertexAt, walkState, ltstAt, sunAt, visorFields, MARS_HOUR_MIN } from "./walk.js";

const route = {
  geometry: { coordinates: [[0, 0, 0], [10, 0, 0], [20, 0, 0], [30, 0, 0], [40, 0, 0]] },
  properties: {
    plan_id: "standin-x",
    stops: [{ id: "S1", name: "one", x: 20, y: 1 }, { id: "S2", name: "two", x: 39, y: 0 }],
    per_vertex: { t_min: [0, 1, 2, 3, 4], margin_min: [100.9, 99.5, 98.2, 97.7, 96.1],
                  slope_deg: [1, 2.04, 3, 4, 5], hazard: [0, 0.1, 0.123, 0.3, 0.4] },
  },
};
const idx = stopVertexIndices(route.geometry.coordinates, route.properties.stops);

test("stops map to the nearest vertex in visiting order", () => assert.deepEqual(idx, [2, 4]));
test("vertexAt finds the segment and fraction", () => {
  assert.deepEqual(vertexAt([0, 1, 2], 1.5), { i: 1, frac: 0.5 });
  assert.deepEqual(vertexAt([0, 1, 2], -1), { i: 0, frac: 0 });
  assert.deepEqual(vertexAt([0, 1, 2], 9), { i: 2, frac: 0 });
});
test("walk state: values from per_vertex at i, next stop after i", () => {
  const s = walkState(route, 1.5, idx);
  assert.equal(s.i, 1); assert.equal(s.x, 15); assert.equal(s.margin_min, 99.5);
  assert.equal(s.next.id, "S1");
  assert.equal(walkState(route, 2.0, idx).next.id, "S2");   // at S1 -> next is S2
  assert.equal(walkState(route, 9, idx).done, true);
  assert.equal(walkState(route, 9, idx).next, null);
});
test("heading: east = +pi/2", () => assert.equal(walkState(route, 0.5, idx).heading, Math.PI / 2));
test("LTST clock and hourly sun lookup", () => {
  const win = { eva_window: { start_ltst: 10, end_ltst: 15 }, ltst_hours: [...Array(24).keys()], sun_elev_deg: [...Array(24).keys()].map((h) => h * 2) };
  assert.equal(ltstAt(win, MARS_HOUR_MIN), 11);
  assert.deepEqual(sunAt(win, 11.7), { hour: 11, elev: 22 });
  assert.equal(ltstAt(null, 5), null);
  assert.equal(sunAt(null, 11), null);
});
test("visor rounding: margin down, time out whole, slope 1 dp, hazard 2 dp", () => {
  const f = visorFields(walkState(route, 1, idx), null, true);
  assert.equal(f.margin, "99"); assert.equal(f.timeOut, "1"); assert.equal(f.slope, "2.0"); assert.equal(f.hazard, "0.10");
  assert.equal(f.stopId, "S1"); assert.equal(f.sun, "—"); assert.equal(f.badge, "STAND-IN ROUTE");
  assert.equal(visorFields(walkState(route, 2.9, idx), null, false).margin, "98");
});
