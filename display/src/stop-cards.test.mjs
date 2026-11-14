// Written with AI assistance (Claude).
// node --test display/src/stop-cards.test.mjs   (no Vite, no DOM, no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeFrame } from "./frame.js";
import { parseCsv, stopsFromCsv, cardHtml } from "./stop-cards.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const photosFile = JSON.parse(read("display/src/stop-photos.json"));

test("parseCsv keeps quoted commas, quotes and newlines", () => {
  const rows = parseCsv('a,b,c\n1,"x, y","say ""hi""\nthere"\r\n2,,z\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "x, y", 'say "hi"\nthere'], ["2", "", "z"]]);
});

test("stopsFromCsv: real science/stops.csv -> 5 stops inside the terrain grid, from lat/lon", () => {
  const f = makeFrame(JSON.parse(read("terrain/out/grid.json")));
  const stops = stopsFromCsv(read("science/stops.csv"), f);
  assert.equal(stops.length, 5);
  assert.deepEqual(stops.map((s) => s.id), ["S1", "S2", "S3", "S4", "S5"]);
  for (const s of stops) {
    assert.ok(f.inside(s.x, s.y), `${s.id} outside grid`);
    assert.equal(s.positionFrom, "latlon");
    // Wording is Mahida's and may change; check the quoted field (with its commas) survived intact.
    assert.match(s.reason, /carbonate [0-9.]+, clay [0-9.]+, olivine( index)? [0-9.]+/);
    assert.match(s.citation, /^CRISM FRT000047A3 .* https:\/\/ode\.rsl\.wustl\.edu\/mars$/);
    assert.ok(s.science_value > 0 && s.science_value <= 1);
  }
});

test("stopsFromCsv: samples/out/stops.csv uses row/col cell centres", () => {
  const f = makeFrame(JSON.parse(read("samples/out/grid.json")));
  const stops = stopsFromCsv(read("samples/out/stops.csv"), f);
  assert.equal(stops.length, 2);
  const [r, c] = f.localToGrid(stops[0].x, stops[0].y);
  assert.ok(Math.abs(r - 116.5) < 1e-9 && Math.abs(c - 160.5) < 1e-9);
  for (const s of stops) {
    assert.equal(s.positionFrom, "grid");
    assert.ok(f.inside(s.x, s.y));
  }
  assert.equal(stops[0].science_value, 0);
});

test("stop-photos.json is valid and every photo has the required fields", () => {
  assert.equal(typeof photosFile._note, "string");
  const entries = Object.entries(photosFile.photos);
  assert.ok(entries.length >= 1);
  for (const [id, p] of entries) {
    assert.equal(p.stop_id, id);
    assert.ok(p.image_id, `${id} image_id`);
    assert.ok(Number.isInteger(p.sol), `${id} sol`);
    assert.match(p.image_url, /^https:\/\/mars\.nasa\.gov\/mars2020-raw-images\/.+\.jpg$/);
    assert.ok(p.image_url.includes(p.image_id), `${id} url matches id`);
    assert.equal(p.credit, "NASA/JPL-Caltech");
    assert.ok(p.note && p.camera);
  }
});


test("cardHtml: photo, caption, note, signal, linked source, escaping", () => {
  const f = makeFrame(JSON.parse(read("terrain/out/grid.json")));
  const s1 = stopsFromCsv(read("science/stops.csv"), f)[0];
  const p = photosFile.photos.S1;
  const html = cardHtml(s1, p);
  assert.ok(html.includes(`src="${p.image_url}"`));
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(html.includes(`Perseverance ${p.camera}, sol ${p.sol} · NASA/JPL-Caltech`));
  assert.ok(html.includes(`href="${p.page_url}" target="_blank"`));
  assert.ok(html.includes("Relative signal strength <strong>0.47</strong> (0–1)"));
  assert.ok(!/(strong|weak|moderate) here/.test(html), "no invented per-stop strong/weak classes");
  assert.ok(html.includes("orbital CRISM data shows signs of minerals, not proof"));
  assert.ok(html.includes('Source: CRISM FRT000047A3 MTRDR browse products, MRO, NASA PDS via ODE <a href="https://ode.rsl.wustl.edu/mars"'));

  const bad = cardHtml({ id: "X<1>", name: '<img onerror="x">', reason: "a & b", citation: "c", science_value: null }, undefined);
  assert.ok(!bad.includes("<img onerror"));
  assert.ok(bad.includes("&lt;img onerror=&quot;x&quot;&gt;") && bad.includes("a &amp; b"));
  assert.ok(bad.includes("No rover photo for this stop yet"));
  assert.ok(!bad.includes("Relative signal strength"));
});

test("cardHtml: a route stop's photo_url wins over stop-photos.json", () => {
  const html = cardHtml({ id: "S1", name: "n", photo_url: "https://example.org/a.jpg", photo_credit: "NASA/JPL-Caltech" }, photosFile.photos.S1);
  assert.ok(html.includes('src="https://example.org/a.jpg"'));
  assert.ok(!html.includes(photosFile.photos.S1.image_url));
  assert.ok(!cardHtml({ id: "S1", name: "n", photo_url: "javascript:alert(1)" }).includes("javascript:"));
});

test("stopsFromCsv: terrain/out/stops.csv (grid copy) uses row/col cell centres", () => {
  const f = makeFrame(JSON.parse(read("terrain/out/grid.json")));
  const stops = stopsFromCsv(read("terrain/out/stops.csv"), f);
  assert.equal(stops.length, 5);
  for (const s of stops) {
    assert.ok(f.inside(s.x, s.y), `${s.id} outside grid`);
    assert.notEqual(s.positionFrom, "latlon");
  }
});
