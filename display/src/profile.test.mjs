// Written with AI assistance (Claude).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { niceTicks, nearestByT, profileGeometry } from "./profile.js";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

test("niceTicks gives round steps inside the range", () => {
  assert.deepEqual(niceTicks(0, 77.3, 4), [0, 20, 40, 60]);
  const t = niceTicks(-2558.4, -2524.2, 3);
  assert.ok(t.every((v) => v >= -2558.4 && v <= -2524.2));
});

test("nearestByT finds the closest time", () => {
  const ts = [0, 0.5, 1, 2, 4];
  assert.equal(nearestByT(ts, 0), 0);
  assert.equal(nearestByT(ts, 1.4), 2);
  assert.equal(nearestByT(ts, 3.1), 4);
  assert.equal(nearestByT(ts, 99), 4);
});

for (const file of ["pipeline/fallback/route.json", "samples/out/route.json"]) {
  test(`profileGeometry uses route.json heights and times as given (${file})`, () => {
    const route = JSON.parse(read(file));
    const g = profileGeometry(route);
    const z = route.geometry.coordinates.map((c) => c[2]);
    assert.equal(g.zMin, Math.min(...z));
    assert.equal(g.zMax, Math.max(...z));
    assert.equal(g.tMax, Math.max(...route.properties.per_vertex.t_min));
    assert.ok(g.line.startsWith("M"));
    assert.equal((g.line.match(/[ML]/g) || []).length, z.length);
  });
}
