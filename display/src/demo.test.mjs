// Written with AI assistance (Claude).
// Tests for demo.js pure parts. Run from display/: node --test src/demo.test.mjs
// demo.js imports neither Leaflet nor CSS (Leaflet is passed in as opts.L), so no DOM or loader stub is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCRIPT, stepAt, indexAtTime, snapToStops, fillCaption, scriptDuration, initDemo } from "./demo.js";

const BRAND = "Marswalk · Phobos Phantoms";

test("DEFAULT_SCRIPT: sorted by at, starts at 0, total <= 35 s", () => {
  assert.ok(DEFAULT_SCRIPT.length > 0);
  assert.equal(DEFAULT_SCRIPT[0].at, 0);
  for (let i = 1; i < DEFAULT_SCRIPT.length; i++) assert.ok(DEFAULT_SCRIPT[i].at >= DEFAULT_SCRIPT[i - 1].at, `step ${i} out of order`);
  assert.ok(scriptDuration(DEFAULT_SCRIPT) <= 35000);
  assert.ok(scriptDuration(DEFAULT_SCRIPT) >= 25000);
});

test("DEFAULT_SCRIPT: every step is { at, do, args } data, captions are strings", () => {
  for (const s of DEFAULT_SCRIPT) {
    assert.equal(typeof s.at, "number");
    assert.equal(typeof s.do, "string");
    assert.equal(typeof s.args, "object");
    if (s.caption !== undefined) assert.equal(typeof s.caption, "string");
  }
  assert.ok(DEFAULT_SCRIPT.some((s) => s.caption === BRAND));
});

test("DEFAULT_SCRIPT: no caption contains a digit (raw and filled)", () => {
  for (const s of DEFAULT_SCRIPT) {
    if (!s.caption || s.caption === BRAND) continue;
    assert.doesNotMatch(s.caption, /\d/, s.caption);
    for (const k of [0, 1, 5, 12, 40]) assert.doesNotMatch(fillCaption(s.caption, { stopCount: k }), /\d/);
  }
});

test("fillCaption: stop count as a word, phrase dropped without stops", () => {
  const c = "The planned route through {stopCount} science stops, coloured by the time left to walk back";
  assert.equal(fillCaption(c, { stopCount: 5 }), "The planned route through five science stops, coloured by the time left to walk back");
  assert.equal(fillCaption(c, { stopCount: 0 }), "The planned route, coloured by the time left to walk back");
  assert.equal(fillCaption(c, { stopCount: 40 }), "The planned route through its science stops, coloured by the time left to walk back");
  assert.equal(fillCaption("plain", { stopCount: 3 }), "plain");
});

test("stepAt: boundaries", () => {
  const s = [{ at: 0 }, { at: 1000 }, { at: 1000 }, { at: 3000 }];
  assert.equal(stepAt(s, -1), -1);
  assert.equal(stepAt(s, 0), 0);
  assert.equal(stepAt(s, 999), 0);
  assert.equal(stepAt(s, 1000), 2); // last of the steps sharing at = 1000
  assert.equal(stepAt(s, 2999), 2);
  assert.equal(stepAt(s, 3000), 3);
  assert.equal(stepAt(s, 1e9), 3);
  assert.equal(stepAt([], 500), -1);
  assert.equal(stepAt([{ at: 100 }], 50), -1);
  assert.equal(stepAt(DEFAULT_SCRIPT, scriptDuration(DEFAULT_SCRIPT)), DEFAULT_SCRIPT.length - 1);
});

test("indexAtTime: start, middle, end, clamping", () => {
  assert.equal(indexAtTime(1000, 1000, 10000, 101), 0);
  assert.equal(indexAtTime(6000, 1000, 10000, 101), 50);
  assert.equal(indexAtTime(11000, 1000, 10000, 101), 100);
  assert.equal(indexAtTime(0, 1000, 10000, 101), 0);       // before start
  assert.equal(indexAtTime(99999, 1000, 10000, 101), 100); // after end
  assert.equal(indexAtTime(5000, 0, 10000, 1), 0);
  assert.equal(indexAtTime(5000, 0, 10000, 0), 0);
  assert.equal(indexAtTime(5000, 0, 0, 10), 9);  // zero duration: jump to the end once started
  assert.equal(indexAtTime(-1, 0, 0, 10), 0);
  for (let t = 0; t <= 12000; t += 37) {
    const i = indexAtTime(t, 1000, 10000, 1822);
    assert.ok(Number.isInteger(i) && i >= 0 && i <= 1821);
  }
});

test("snapToStops: reduced-motion walk jumps between start, stops and end", () => {
  assert.equal(snapToStops(0, [100, 300], 500), 0);
  assert.equal(snapToStops(99, [100, 300], 500), 0);
  assert.equal(snapToStops(100, [300, 100], 500), 100);
  assert.equal(snapToStops(498, [100, 300], 500), 300);
  assert.equal(snapToStops(499, [100, 300], 500), 499);
  assert.equal(snapToStops(5, [], 0), 0);
});

test("initDemo: requires L", () => {
  assert.throws(() => initDemo({}, {}), TypeError);
});
