// Written with AI assistance (Claude).
import test from "node:test";
import assert from "node:assert/strict";
import { heightSampler, pickLod, pixelRatioFor, clampExag, exagLabel, defaultCamera, topCamera, easeInOut, thin, rgbToUnit, EXAG_DEFAULT } from "./view3d-core.js";

test("heightSampler: corners and bilinear middle (same as xr/src/terrain.js)", () => {
  const s = heightSampler(new Float32Array([0, 10, 20, 30]), 2, 100);
  assert.equal(s(0, 0), 0); assert.equal(s(100, 0), 10); assert.equal(s(0, -100), 20); assert.equal(s(50, -50), 15);
  assert.equal(s(-5, 5), 0);   // clamped outside
});
test("pickLod: 256 on phones, 512 otherwise, falls back to what exists", () => {
  const lods = [{ width: 256 }, { width: 512 }];
  assert.equal(pickLod(lods, 390).width, 256); assert.equal(pickLod(lods, 1440).width, 512);
  assert.equal(pickLod([{ width: 256 }], 1440).width, 256);
});
test("pixel ratio capped lower on phones", () => {
  assert.equal(pixelRatioFor(3, 390), 1.25); assert.equal(pixelRatioFor(3, 1440), 2); assert.equal(pixelRatioFor(1, 390), 1);
});
test("exaggeration: 1x-3x, default 1.5x, labelled", () => {
  assert.equal(EXAG_DEFAULT, 1.5); assert.equal(clampExag(9), 3); assert.equal(clampExag(0.2), 1); assert.equal(clampExag("x"), 1.5);
  assert.equal(exagLabel(2), "Vertical exaggeration 2.0×");
});
test("cameras look at the centre; ease is monotonic 0..1", () => {
  assert.deepEqual(defaultCamera(1500).target, [750, 0, 750]);
  assert.ok(topCamera(1500).position[1] > defaultCamera(1500).position[1]);
  assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1); assert.ok(easeInOut(0.25) < easeInOut(0.75));
});
test("thin keeps first + last, drops close points; rgbToUnit", () => {
  assert.deepEqual(thin([[0, 0], [1, 0], [5, 0], [6, 0]], 4), [[0, 0], [5, 0], [6, 0]]);
  assert.deepEqual(thin([]), []);
  assert.deepEqual(rgbToUnit("rgb(255,0,51)"), [1, 0, 0.2]);
});
