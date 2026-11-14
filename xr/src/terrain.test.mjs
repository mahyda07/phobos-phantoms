// Written with AI assistance (Claude).
// Run: npm test   (inside xr/)
import test from "node:test";
import assert from "node:assert/strict";
import { heightSampler, marginColour, holoScale } from "./terrain.js";

test("height sampler hits grid nodes and interpolates", () => {
  const n = 3, ext = 100;               // nodes at x = 0, 50, 100 and y = 0, -50, -100
  const h = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const s = heightSampler(h, n, ext);
  assert.equal(s(0, 0), 0);             // NW corner
  assert.equal(s(100, -100), 8);        // SE corner
  assert.equal(s(50, -50), 4);          // centre
  assert.equal(s(25, 0), 0.5);          // halfway along the north edge
  assert.equal(s(-10, 10), 0);          // clamps outside the grid
});

test("margin colours", () => {
  assert.deepEqual(marginColour(120), [0.2, 0.85, 0.35]);
  assert.deepEqual(marginColour(30), [1.0, 0.72, 0.1]);
  assert.deepEqual(marginColour(5), [0.95, 0.2, 0.15]);
});

test("0.6 m hologram of 1500 m is 1:2500", () => {
  assert.equal(1 / holoScale(0.6, 1500), 2500);
});
