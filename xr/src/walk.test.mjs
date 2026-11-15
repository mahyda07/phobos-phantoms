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

// ---------- run 2: Get me home (src/home.js) ----------
import { homeRequest, classifyError, planHome, homeSummary, reversedWalkedPath } from "./home.js";

test("homeRequest snaps to route vertex i (walkable), ends at the walk start, no stops, hazard on", () => {
  const r = homeRequest(route.geometry.coordinates, 3, [33, 0]);
  assert.deepEqual(r.body, { frame: "jezero-local-v1", start: [30, 0], end: [0, 0], stops: [], use_hazard: true });
  assert.equal(r.snapped_m, 3); assert.equal(r.vertex, 3); assert.equal(r.atStart, false);
  assert.equal(homeRequest(route.geometry.coordinates, 3, null, 10).atStart, true);   // clamped to vertex 0
});

test("classifyError", () => {
  assert.equal(classifyError({ name: "AbortError" }), "asleep");
  assert.equal(classifyError({ status: 422, message: "start is on blocked ground (slope 31.0 deg > 25)" }), "blocked");
  assert.equal(classifyError({ name: "TypeError" }), "offline");
  assert.equal(classifyError({}, false), "offline");
  assert.equal(classifyError({ status: 500, message: "x" }), "other");
});

const okRoute = { properties: { length_m: 1591.8, time_out_min: 32.4, margin_min: 168.6, per_vertex: { t_min: [0, 32.4] } } };
const res = (status, body) => ({ ok: status < 400, status, json: async () => body });

test("planHome: asleep → 'waking' then retry once with the long timeout", async () => {
  const seen = []; let n = 0;
  const fetchImpl = async () => { n++; if (n === 1) throw Object.assign(new Error("aborted"), { name: "AbortError" }); return res(200, okRoute); };
  const out = await planHome(route.geometry.coordinates, 3, [33, 0], { fetchImpl, onStatus: (s) => seen.push(s), online: () => true });
  assert.equal(out.route, okRoute); assert.equal(out.tries, 2); assert.deepEqual(seen, ["waking"]);
});

test("planHome: blocked start → steps back along the route; offline → fallback", async () => {
  const starts = [];
  const fetchImpl = async (_u, o) => { const b = JSON.parse(o.body); starts.push(b.start[0]);
    return b.start[0] === 30 ? res(422, { detail: { error: "start is on blocked ground (slope 30 deg > 25)" } }) : res(200, okRoute); };
  const out = await planHome(route.geometry.coordinates, 3, [33, 0], { fetchImpl, online: () => true });
  assert.deepEqual(starts, [30]);   // vertex 3 blocked → back 3 = vertex 0 = the start itself → reverse the walked path
  assert.equal(out.fallback, true); assert.equal(out.reason, "at-start");
  const long = Array.from({ length: 40 }, (_, k) => [k * 10, 0]);
  const s2 = [];
  const f2 = async (_u, o) => { const b = JSON.parse(o.body); s2.push(b.start[0]); return b.start[0] === 300 ? res(422, { detail: { error: "start is on blocked ground" } }) : res(200, okRoute); };
  const o2 = await planHome(long, 30, [305, 0], { fetchImpl: f2, online: () => true });
  assert.deepEqual(s2, [300, 270]); assert.equal(o2.req.vertex, 27); assert.equal(o2.route, okRoute);
  const off = await planHome(route.geometry.coordinates, 3, [33, 0], { fetchImpl: async () => { throw new Error("x"); }, online: () => false });
  assert.deepEqual(off, { fallback: true, reason: "offline" });
});

test("homeSummary uses the response numbers as given", () => {
  assert.equal(homeSummary(okRoute).text, "Return route: 1592 m, ~32 min, margin 168 min");
});

test("reversedWalkedPath: walked vertices backwards from the walker, time from per_vertex", () => {
  const r = reversedWalkedPath(route, 2, [25, 0]);
  assert.deepEqual(r.coords, [[25, 0], [20, 0], [10, 0], [0, 0]]);
  assert.equal(r.length_m, 25); assert.equal(r.time_min, 2.5);
  assert.match(r.text, /planner offline/);
});

// ---------- run 2: keyboard map (src/keys.js) ----------
import { keyAction, helpHtml, BINDINGS } from "./keys.js";
test("keyAction maps keys, ignores typing and modifier shortcuts", () => {
  assert.equal(keyAction({ key: "h" }), "home"); assert.equal(keyAction({ key: "H" }), "home");
  assert.equal(keyAction({ key: "ArrowUp" }), "forward"); assert.equal(keyAction({ key: " " }), "pause");
  assert.equal(keyAction({ key: "?" }), "help"); assert.equal(keyAction({ key: "/", shiftKey: true }), "help");
  assert.equal(keyAction({ key: "Escape" }), "close");
  assert.equal(keyAction({ key: "h", target: { tagName: "INPUT" } }), null);
  assert.equal(keyAction({ key: "h", ctrlKey: true }), null);
  assert.equal(keyAction({ key: "q" }), null);
});
test("help overlay lists keyboard AND controller bindings, escaped", () => {
  const html = helpHtml();
  for (const b of BINDINGS) assert.ok(html.includes(b.what.replace(/&/g, "&amp;").replace(/</g, "&lt;")), b.what);
  assert.ok(html.includes("Hold A for 1 s") && html.includes("<kbd>H</kbd>") && html.includes("Quest controller"));
  assert.ok(!helpHtml([{ keys: ["<x>"], pad: "", what: "y" }]).includes("<x>"));
});

// ---------- run 2: voice callouts (src/audio.js) ----------
import { calloutsFor, Limiter } from "./audio.js";
test("calloutsFor: stop reached, margin crossing 60, hazard/steep within 30 m ahead", () => {
  const r = {
    geometry: { coordinates: [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [80, 0]] },
    properties: { per_vertex: { margin_min: [70, 65, 61, 59, 50, 40], slope_deg: [1, 1, 1, 22, 1, 1], hazard: [0, 0, 0, 0, 0.6, 0] } },
  };
  assert.deepEqual(calloutsFor(r, 0, null, [2]), ["steep"]);              // 22 deg at 30 m ahead; hazard at 40 m is too far
  assert.deepEqual(calloutsFor(r, 1, { i: 0, margin: 70 }, [2]), ["hazard", "steep"]);
  assert.deepEqual(calloutsFor(r, 3, { i: 2, margin: 61 }, [2]), ["margin", "hazard"]);   // crossed 60; stop 2 was already passed
  assert.deepEqual(calloutsFor(r, 2, { i: 1, margin: 65 }, [2]), ["stop", "hazard", "steep"]);
  assert.deepEqual(calloutsFor(r, 5, { i: 4, margin: 50 }, [2]), []);
});
test("Limiter: >= 8 s between lines, >= 30 s before the same line", () => {
  const L = new Limiter();
  assert.equal(L.allow("steep", 0), true);
  assert.equal(L.allow("hazard", 7999), false);
  assert.equal(L.allow("hazard", 8000), true);
  assert.equal(L.allow("steep", 20000), false);   // same line within 30 s
  assert.equal(L.allow("steep", 30000), true);
});

// ---------- run 2: haptic hazard (src/haptics.js) ----------
import { shouldBuzz, pulseAll } from "./haptics.js";
test("shouldBuzz: hazard > 0.5 or slope > 20, at most every 700 ms, off switch", () => {
  assert.equal(shouldBuzz({ hazard: 0.6, slope_deg: 5 }, 1000, 0), true);
  assert.equal(shouldBuzz({ hazard: 0.1, slope_deg: 21 }, 1000, 0), true);
  assert.equal(shouldBuzz({ hazard: 0.5, slope_deg: 20 }, 1000, 0), false);    // thresholds are strict
  assert.equal(shouldBuzz({ hazard: 0.9, slope_deg: 30 }, 1000, 400), false);  // 600 ms since last
  assert.equal(shouldBuzz({ hazard: 0.9 }, 1000, 0, false), false);
});
test("pulseAll: feature-detects pulse() and vibrationActuator, skips the rest", () => {
  const calls = [];
  const session = { inputSources: [
    { gamepad: { hapticActuators: [{ pulse: (s, d) => { calls.push(["pulse", s, d]); return Promise.resolve(); } }] } },
    { gamepad: { vibrationActuator: { playEffect: (t, o) => { calls.push([t, o.duration]); return Promise.resolve(); } } } },
    { gamepad: {} }, { hand: {} },
  ] };
  assert.equal(pulseAll(session), 2);
  assert.deepEqual(calls, [["pulse", 0.4, 60], ["dual-rumble", 60]]);
});

// ---------- run 2: ghost rover (src/ghost.js) ----------
import { roverTrack, roverAt, ghostLabel } from "./ghost.js";
const rover = { features: [
  { properties: { sol: 410, length_m: 10 }, geometry: { coordinates: [[100, 0], [110, 0]] } },
  { properties: { sol: 405, length_m: 20 }, geometry: { coordinates: [[0, 0], [10, 0], [10, 10]] } },
] };
test("roverTrack sorts by sol and accumulates distance (a gap between sols is a jump, not distance)", () => {
  const t = roverTrack(rover);
  assert.deepEqual(t.pts.map((p) => p.sol), [405, 405, 405, 410, 410]);
  assert.equal(t.pts[3].jump, true);
  assert.equal(t.length, 30);
});
test("roverAt interpolates, wraps, keeps the sol of the segment", () => {
  const t = roverTrack(rover);
  assert.deepEqual(roverAt(t, 5), { x: 5, y: 0, heading: Math.PI / 2, sol: 405 });
  assert.equal(roverAt(t, 15).y, 5);
  assert.equal(roverAt(t, t.length + 5).x, 5);       // wraps
});
test("ghostLabel takes sols from the file, says the speed is a display speed", () => {
  assert.equal(ghostLabel(rover).title, "Perseverance's real path (sols 405–410)");
  assert.match(ghostLabel(rover).note, /fixed display speed/);
  assert.equal(ghostLabel({ features: [] }).title, "Perseverance's real path");
});
