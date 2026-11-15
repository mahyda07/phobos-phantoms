// Written with AI assistance (Claude).
import test from "node:test";
import assert from "node:assert/strict";
import { heightSampler, pickLod, pixelRatioFor, clampExag, exagLabel, defaultCamera, topCamera, easeInOut, thin, rgbToUnit, EXAG_DEFAULT,
  RELIEF_STOPS, reliefColor, reliefCss, srgbToLinear, wholeMetres, heightLabel, projectToScreen, nearestScreenPoint, distToSegment, isClick } from "./view3d-core.js";

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

const lum = ([r, g, b]) => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
test("reliefColor: ends are the first/last stop, clamps outside 0..1, lightness only goes up", () => {
  const hex = (c) => "#" + c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  assert.equal(hex(reliefColor(0)), RELIEF_STOPS[0]); assert.equal(hex(reliefColor(1)), RELIEF_STOPS[RELIEF_STOPS.length - 1]);
  assert.equal(hex(reliefColor(0.5)), RELIEF_STOPS[2]);
  assert.deepEqual(reliefColor(-3), reliefColor(0)); assert.deepEqual(reliefColor(7), reliefColor(1)); assert.deepEqual(reliefColor(NaN), reliefColor(0));
  let prev = -1;
  for (let i = 0; i <= 200; i++) { const l = lum(reliefColor(i / 200)); assert.ok(l >= prev, `lightness drops at t=${i / 200}`); prev = l; }
  assert.ok(reliefCss().startsWith("linear-gradient(to right, #35100a")); assert.ok(reliefCss("to top").includes("#f3bd86"));
});
test("srgbToLinear: 0, 1 and the mid grey", () => {
  assert.equal(srgbToLinear(0), 0); assert.ok(Math.abs(srgbToLinear(1) - 1) < 1e-12); assert.ok(Math.abs(srgbToLinear(0.5) - 0.2140) < 1e-3);
});
test("height legend: whole metres from the meta file, real minus sign, null when missing", () => {
  assert.equal(wholeMetres(-2560.03), "−2560"); assert.equal(wholeMetres(-2460.88), "−2461"); assert.equal(wholeMetres(12.4), "12");
  assert.equal(heightLabel(-2560.0317993164062, -2460.8798828125).text, "Height −2560 m … −2461 m (HiRISE DTM)");
  assert.equal(heightLabel(undefined, 3), null);
});
test("projectToScreen: identity matrix maps NDC to pixels (y down), points behind the camera are NaN", () => {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const out = projectToScreen(new Float32Array([0, 0, 0, 1, 1, 0, -1, -1, 0, 0, 0, 5]), I, 200, 100, new Float32Array(8));
  assert.deepEqual([...out.slice(0, 6)], [100, 50, 200, 0, 0, 100]);
  assert.ok(Number.isNaN(out[6]) && Number.isNaN(out[7]));                      // outside the depth range
  const P = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0];                    // w = -z: z > 0 is behind the camera
  assert.ok(Number.isNaN(projectToScreen(new Float32Array([0, 0, 2]), P, 10, 10, new Float32Array(2))[0]));
});
test("nearestScreenPoint: nearest within the radius, -1 outside it, skips NaN", () => {
  const xy = new Float32Array([NaN, NaN, 10, 10, 30, 10, 31, 10]);
  assert.equal(nearestScreenPoint(xy, 12, 11, 12), 1); assert.equal(nearestScreenPoint(xy, 31, 12, 12), 3);
  assert.equal(nearestScreenPoint(xy, 100, 100, 12), -1); assert.equal(nearestScreenPoint(new Float32Array(0), 1, 1), -1);
});
test("distToSegment and isClick (a drag of more than 4 px is not a click)", () => {
  assert.equal(distToSegment(5, 3, 0, 0, 10, 0), 3); assert.equal(distToSegment(-4, 3, 0, 0, 10, 0), 5); assert.equal(distToSegment(1, 1, 1, 1, 1, 1), 0);
  assert.equal(isClick(10, 10, 12, 12), true); assert.equal(isClick(10, 10, 15, 10), false);
});
test("defaultCamera steps back on narrow views, never closer than the wide default", () => {
  const wide = defaultCamera(1500), phone = defaultCamera(1500, 390 / 460), ultra = defaultCamera(1500, 3);
  assert.deepEqual(wide.position, ultra.position); assert.ok(phone.position[1] > wide.position[1]);
  assert.deepEqual(phone.target, [750, 0, 750]); assert.deepEqual(defaultCamera(1500, NaN).position, wide.position);
});
