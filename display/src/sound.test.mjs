// Written with AI assistance (Claude).
import test from "node:test";
import assert from "node:assert/strict";
import { SFX, SFX_GAIN, readSoundOn } from "./sound.js";
test("map sound: off by default, stored choice read safely", () => {
  assert.equal(readSoundOn(null), false);
  assert.equal(readSoundOn({ getItem: () => "1" }), true);
  assert.equal(readSoundOn({ getItem: () => { throw new Error("blocked"); } }), false);
});
test("map SFX: same five recipes as the headset, -18 dB bus", () => {
  assert.deepEqual(Object.keys(SFX).sort(), ["click", "home", "route", "stop", "warning"]);
  assert.ok(Math.abs(20 * Math.log10(SFX_GAIN) + 18) < 0.05);
});
