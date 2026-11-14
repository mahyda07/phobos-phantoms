// Written with AI assistance (Claude).
// Tests for planner.js. Run from the repo root: node --test display/src/planner.test.mjs  (Node 22, no Vite, no new deps)
// planner.js imports "leaflet" and "./planner.css" for the browser; a tiny loader hook stubs both here,
// so only the pure functions (leafletToLocal, buildPlanRequest, requestPlan) are exercised.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HOOKS = `
export async function resolve(spec, ctx, next) {
  if (spec === "leaflet" || spec.endsWith(".css")) return { url: "stub:" + spec, shortCircuit: true };
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.startsWith("stub:")) return { format: "module", source: "export default {};", shortCircuit: true };
  return next(url, ctx);
}`;
register("data:text/javascript," + encodeURIComponent(HOOKS));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const { makeFrame } = await import("./frame.js");
const { leafletToLocal, buildPlanRequest, requestPlan, PLAN_TIMEOUT_MS } = await import("./planner.js");

const readJson = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const SCHEMA = readJson("contracts/plan.request.schema.json");
const EXAMPLE = readJson("contracts/examples/plan.request.example.json");
const SAMPLE_ROUTE_TEXT = readFileSync(path.join(ROOT, "samples/out/route.json"), "utf8");

// ---- leafletToLocal ----
for (const gridFile of ["samples/out/grid.json", "terrain/out/grid.json"]) {
  test(`leafletToLocal is the inverse of f.localToLeaflet (${gridFile})`, () => {
    const f = makeFrame(readJson(gridFile));
    const W = f.width * f.cell, H = f.height * f.cell;
    const pts = [[0, 0], [40, -480], [480, -40], [W / 2, -H / 2], [W - 0.5, -H + 0.5], [1.25, -3.75], [123.456, -789.01 % H]];
    for (const [x, y] of pts) {
      const ll = f.localToLeaflet(x, y);
      const [x2, y2] = leafletToLocal(f, { lat: ll[0], lng: ll[1] });
      assert.ok(Math.abs(x2 - x) < 1e-9 && Math.abs(y2 - y) < 1e-9, `(${x}, ${y}) -> (${x2}, ${y2})`);
      assert.deepEqual(leafletToLocal(f, ll), [x2, y2], "array form gives the same answer");
      // and the other direction: latlng -> local -> latlng
      const back = f.localToLeaflet(x2, y2);
      assert.ok(Math.abs(back[0] - ll[0]) < 1e-9 && Math.abs(back[1] - ll[1]) < 1e-9);
    }
    // Leaflet bounds corners map to the grid corners; f.inside rejects clicks just outside.
    assert.deepEqual(leafletToLocal(f, { lat: f.height, lng: 0 }), [0, 0]);
    const [cx, cy] = leafletToLocal(f, { lat: 0, lng: f.width });
    assert.equal(cx, W); assert.equal(cy, -H);
    assert.equal(f.inside(...leafletToLocal(f, { lat: f.height / 2, lng: f.width / 2 })), true);
    assert.equal(f.inside(...leafletToLocal(f, { lat: f.height + 1, lng: 10 })), false, "north of the grid");
    assert.equal(f.inside(...leafletToLocal(f, { lat: 10, lng: -1 })), false, "west of the grid");
    assert.equal(f.inside(...leafletToLocal(f, { lat: -1, lng: 10 })), false, "south of the grid");
    assert.equal(f.inside(...leafletToLocal(f, { lat: 10, lng: f.width + 1 })), false, "east of the grid");
  });
}

// ---- buildPlanRequest ----
function checkAgainstSchema(body) {
  assert.equal(SCHEMA.additionalProperties, false);
  const allowed = Object.keys(SCHEMA.properties);
  for (const k of Object.keys(body)) assert.ok(allowed.includes(k), `key ${k} is not in the schema`);
  for (const k of SCHEMA.required) assert.ok(k in body, `required key ${k} missing`);
  assert.equal(body.frame, SCHEMA.properties.frame.const);
  for (const k of ["start", "end"]) {
    const s = SCHEMA.properties[k];
    assert.ok(Array.isArray(body[k]));
    assert.ok(body[k].length >= s.minItems && body[k].length <= s.maxItems);
    assert.ok(body[k].every((v) => typeof v === "number"));
  }
  assert.ok(Array.isArray(body.stops) && body.stops.every((v) => typeof v === "string"));
  assert.equal(new Set(body.stops).size, body.stops.length, "uniqueItems");
  if ("use_hazard" in body) assert.equal(typeof body.use_hazard, "boolean");
}

test("buildPlanRequest matches the contract and the example exactly", () => {
  const body = buildPlanRequest({ start: [40.0, -480.0], end: [480.0, -40.0], stops: ["S1", "S2"] });
  assert.deepEqual(Object.keys(body), ["frame", "start", "end", "stops", "use_hazard"]);
  checkAgainstSchema(body);
  checkAgainstSchema(EXAMPLE);
  assert.deepEqual(body, EXAMPLE);
  const off = buildPlanRequest({ start: [1, -2], end: [3, -4], stops: [], useHazard: false });
  checkAgainstSchema(off);
  assert.equal(off.use_hazard, false);
  assert.deepEqual(off.stops, []);
});

test("buildPlanRequest rejects inputs that break the contract", () => {
  assert.throws(() => buildPlanRequest({ start: [1], end: [1, 2], stops: [] }), TypeError);
  assert.throws(() => buildPlanRequest({ start: [1, NaN], end: [1, 2], stops: [] }), TypeError);
  assert.throws(() => buildPlanRequest({ start: [1, 2], end: ["1", 2], stops: [] }), TypeError);
  assert.throws(() => buildPlanRequest({ start: [1, 2], end: [1, 2], stops: [1] }), TypeError);
  assert.throws(() => buildPlanRequest({ start: [1, 2], end: [1, 2], stops: ["S1", "S1"] }), TypeError);
  assert.throws(() => buildPlanRequest({ start: [1, 2], end: [1, 2], stops: [], useHazard: "yes" }), TypeError);
});

// ---- requestPlan against the mock server ----
const MOCK = path.join(ROOT, "display/scripts/mock-planner.mjs");
const children = [];
function startMock(extra = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MOCK, "--port", "0", ...extra], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (m) resolve(m[1]);
    });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (code) => reject(new Error(`mock exited ${code}: ${out}`)));
  });
}
after(() => { for (const c of children) c.kill(); });

const BODY = buildPlanRequest({ start: [40, -480], end: [480, -40], stops: ["S1", "S2"] });

test("requestPlan: success returns samples/out/route.json unchanged", async () => {
  const url = await startMock();
  const health = await fetch(url + "/health").then((r) => r.json());
  assert.deepEqual(health, { ok: true });
  const res = await requestPlan(BODY, { url });
  assert.equal(res.ok, true);
  assert.deepEqual(res.route, JSON.parse(SAMPLE_ROUTE_TEXT));
  // trailing slash on the URL is fine
  assert.equal((await requestPlan(BODY, { url: url + "/" })).ok, true);
});

test("mock planner: rejects bodies outside the contract with 400, answers CORS preflight", async () => {
  const url = await startMock();
  const post = (b) => fetch(url + "/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  assert.equal((await post({ ...BODY, extra: 1 })).status, 400);
  assert.equal((await post({ ...BODY, frame: "other" })).status, 400);
  assert.equal((await post({ ...BODY, start: [1, 2, 3] })).status, 400);
  const { use_hazard, ...noHazard } = BODY;
  assert.equal((await post(noHazard)).status, 200, "use_hazard is optional");
  const pre = await fetch(url + "/plan", { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:5174", "Access-Control-Request-Method": "POST" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "http://127.0.0.1:5174");
  assert.match(pre.headers.get("access-control-allow-headers"), /Content-Type/i);
});

test("requestPlan: waits 10 s by default (agreed with the planner team)", () => {
  assert.equal(PLAN_TIMEOUT_MS, 10000);
});

test("requestPlan: a planner answering in 4 s still succeeds with the default wait", async () => {
  const url = await startMock(["--delay", "4000"]);
  const res = await requestPlan(BODY, { url });
  assert.equal(res.ok, true);
});

test("requestPlan: planner slower than the wait -> timeout", async () => {
  const url = await startMock(["--delay", "1500"]);
  const t0 = Date.now();
  const res = await requestPlan(BODY, { url, timeoutMs: 1000 });
  const dt = Date.now() - t0;
  assert.deepEqual(res, { ok: false, reason: "timeout" });
  assert.ok(dt >= 950 && dt < 1300, `took ${dt} ms`);
});

test("requestPlan: planner error -> http-500", async () => {
  const url = await startMock(["--fail"]);
  assert.deepEqual(await requestPlan(BODY, { url }), { ok: false, reason: "http-500" });
});

test("requestPlan: no URL configured -> no-url (no fetch made)", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; };
  assert.deepEqual(await requestPlan(BODY, { url: undefined, fetchImpl }), { ok: false, reason: "no-url" });
  assert.deepEqual(await requestPlan(BODY, { url: "", fetchImpl }), { ok: false, reason: "no-url" });
  assert.equal(called, false);
});

test("requestPlan: unreachable planner -> network", async () => {
  const fetchImpl = async () => { throw new TypeError("fetch failed"); };
  assert.deepEqual(await requestPlan(BODY, { url: "http://127.0.0.1:1", fetchImpl }), { ok: false, reason: "network" });
});

test("requestPlan: reply that is not a route.json -> bad-reply", async () => {
  const reply = (json) => async () => ({ ok: true, status: 200, json: async () => json });
  const route = JSON.parse(SAMPLE_ROUTE_TEXT);
  const cases = [
    { hello: "world" },
    { ...route, type: "FeatureCollection" },
    { ...route, geometry: { type: "Point", coordinates: [0, 0] } },
    { ...route, properties: { ...route.properties, per_vertex: undefined } },
    null,
  ];
  for (const c of cases) assert.deepEqual(await requestPlan(BODY, { url: "http://x", fetchImpl: reply(c) }), { ok: false, reason: "bad-reply" });
  const notJson = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } });
  assert.deepEqual(await requestPlan(BODY, { url: "http://x", fetchImpl: notJson }), { ok: false, reason: "bad-reply" });
  // and the stub sees exactly the contract request
  let seen;
  const spy = async (u, init) => { seen = { u, init }; return { ok: true, status: 200, json: async () => route }; };
  assert.equal((await requestPlan(BODY, { url: "http://x", fetchImpl: spy })).ok, true);
  assert.equal(seen.u, "http://x/plan");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(seen.init.body), BODY);
});
