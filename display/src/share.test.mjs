// Written with AI assistance (Claude).
// node --test display/src/share.test.mjs   (DOM-free, no deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeState, decodeState, readInitialState, LAYER_IDS } from "./share.js";

const full = {
  point: 700, zoom: 1.5, center: [375, 375], layers: ["slope", "rover"], proof: true,
  start: [120, -340], end: [610, -95], stops: ["S1", "S3"], useHazard: true,
};

test("encode: fixed order and format", () => {
  assert.equal(encodeState(full), "p=700&z=1.5&c=375.0,375.0&l=slope,rover&v=1&s=120,-340&e=610,-95&k=S1.S3&h=1");
});

test("round-trip keeps every field", () => {
  assert.deepEqual(decodeState(encodeState(full)), full);
  const noHaz = { ...full, useHazard: false, proof: false };
  const back = decodeState(encodeState(noHaz));
  assert.equal(back.useHazard, false);
  assert.equal(back.proof, undefined); // proof off is the default: not written
});

test("omitted fields stay omitted", () => {
  assert.equal(encodeState({}), "");
  assert.equal(encodeState({ point: 0 }), "p=0");
  assert.deepEqual(decodeState(encodeState({ zoom: 2 })), { zoom: 2 });
  assert.deepEqual(decodeState(""), {});
  assert.deepEqual(decodeState("#"), {});
  // planner fields need both start and end
  assert.equal(encodeState({ start: [1, 2], stops: ["S1"], useHazard: true }), "");
});

test("empty layer list means all overlays off (differs from no l)", () => {
  assert.equal(encodeState({ layers: [] }), "l=");
  assert.deepEqual(decodeState("l="), { layers: [] });
  assert.deepEqual(decodeState("p=3"), { point: 3 });
});

test("layer ids: unknown dropped, order fixed", () => {
  assert.deepEqual(decodeState("l=rover,foo,slope").layers, ["slope", "rover"]);
  assert.equal("layers" in decodeState("l=foo"), false);
  assert.equal(encodeState({ layers: ["route", "Slope", "dem"] }), "l=dem,route");
  assert.deepEqual(LAYER_IDS, ["slope", "rough", "dem", "hazard", "science", "rover", "stops", "route"]);
});

test("malformed values are dropped", () => {
  assert.deepEqual(decodeState("p=abc&z=NaN&l=foo&h=7&s=1,2,3&e=4,5"), {});
  assert.deepEqual(decodeState("p=1.5"), {});
  assert.deepEqual(decodeState("p=-2"), {});
  assert.deepEqual(decodeState("z=Infinity&c=1,NaN"), {});
  assert.deepEqual(decodeState("c=1,2,3"), {});
  assert.deepEqual(decodeState("v=yes"), {});
  assert.deepEqual(decodeState("z=1e3"), {});
  const st = decodeState("s=1,2&e=3,4&h=7");
  assert.deepEqual(st, { start: [1, 2], end: [3, 4] });
});

test("unknown keys ignored; leading # handled", () => {
  assert.deepEqual(decodeState("#p=5&name=Alice&foo=bar"), { point: 5 });
  assert.deepEqual(decodeState("p=5"), decodeState("#p=5"));
});

test("stop ids only /^S\\d+$/, no repeats", () => {
  assert.deepEqual(decodeState("s=1,2&e=3,4&k=S1.S12").stops, ["S1", "S12"]);
  assert.equal("stops" in decodeState("s=1,2&e=3,4&k=S1.X2"), false);
  assert.equal("stops" in decodeState("s=1,2&e=3,4&k=S1.S1"), false);
  assert.equal("stops" in decodeState("s=1,2&e=3,4&k=s1"), false);
  assert.equal(encodeState({ start: [1, 2], end: [3, 4], stops: ["S2", "<b>", "S5"] }), "s=1,2&e=3,4&k=S2.S5");
});

test("planner coordinates are integers", () => {
  assert.equal(encodeState({ start: [12.6, -3.4], end: [0.2, 99.5] }), "s=13,-3&e=0,100");
  assert.equal("start" in decodeState("s=1.5,2&e=3,4"), false);
  assert.ok(decodeState("s=10,-20&e=30,40").start.every(Number.isInteger));
  // k/h without valid s+e are dropped
  assert.deepEqual(decodeState("k=S1&h=1"), {});
});

test("zoom and centre: one decimal", () => {
  assert.equal(encodeState({ zoom: 1.25, center: [374.96, -0.01] }), "z=1.3&c=375.0,0.0");
  assert.deepEqual(decodeState("z=-1.5&c=-12.5,600.0"), { zoom: -1.5, center: [-12.5, 600] });
});

test("over-long hash is ignored; readInitialState is null without a hash", () => {
  assert.deepEqual(decodeState("p=1&x=" + "a".repeat(3000)), {});
  assert.equal(readInitialState(), null); // no location under node
});
