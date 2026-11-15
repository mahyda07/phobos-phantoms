// Written with AI assistance (Claude).
// node --test display/src/sources.test.mjs   (DOM-free, no deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { legendFor, sourcesHtml, legendHtml, HAZARD_TITLE } from "./sources.js";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const current = JSON.parse(readFileSync(join(repo, "terrain/out/layers.manifest.json"), "utf8"));

function upcoming() {
  try {
    return JSON.parse(execFileSync("git", ["show", "origin/p2-terrain:terrain/out/layers.manifest.json"],
      { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch { return null; }
}

function checkAllRows(manifest) {
  const html = sourcesHtml(manifest);
  for (const l of manifest.layers) {
    assert.ok(html.includes(esc(l.name)), `name of ${l.id}`);
    assert.ok(html.includes(esc(l.licence)), `licence of ${l.id}`);
    const url = /^https?:\/\/\S+/.exec(l.citation)?.[0];
    if (url) assert.ok(html.includes(`href="${esc(url)}"`), `citation link of ${l.id}`);
    else {
      assert.ok(html.includes(esc(l.citation)), `citation text of ${l.id}`);
      assert.ok(!html.includes(`href="${esc(l.citation)}"`), `non-http citation of ${l.id} is not a link`);
    }
  }
  assert.equal((html.match(/class="src-row"/g) || []).length, manifest.layers.length);
}

test("sourcesHtml lists every layer of the current manifest", () => checkAllRows(current));

test("sourcesHtml lists every layer of the p2-terrain manifest (science + stops)", (t) => {
  const m = upcoming();
  if (!m) return t.skip("git or origin/p2-terrain unavailable");
  checkAllRows(m);
  const html = sourcesHtml(m);
  assert.ok(html.includes('href="https://ode.rsl.wustl.edu/mars"'));
  assert.ok(html.includes("(product FRT000047A3)"));
});

test("sourcesHtml escapes everything and links only http(s)", () => {
  const html = sourcesHtml({ layers: [
    { name: "<script>x</script>", source: 'a"b', licence: "c & d", citation: "javascript:alert(1)" },
    { name: "ok", source: "s", licence: "l", citation: 'https://e.org/"onmouseover=x' },
  ] }, { extra: [{ name: "Extra <b>", source: "NASA/JPL-Caltech", licence: "NASA media guidelines", citation: "https://mars.nasa.gov/mars2020/multimedia/raw-images/" }] });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt;"));
  assert.ok(html.includes("a&quot;b") && html.includes("c &amp; d"));
  assert.ok(!/href="javascript:/i.test(html));
  assert.ok(html.includes('href="https://e.org/"'), "URL stops at the quote");
  assert.ok(!html.includes('"onmouseover'));
  assert.ok(html.includes("Extra &lt;b&gt;"));
  assert.ok(html.includes('href="https://mars.nasa.gov/mars2020/multimedia/raw-images/"'));
});

test("legendFor('slope') uses the manifest range and the build_terrain.py green-yellow-red map", () => {
  const lg = legendFor("slope", current, null);
  assert.equal(current.layers.find((l) => l.id === "slope").colormap, "0-35 deg green-red");
  assert.equal(lg.minLabel, "0°");
  assert.equal(lg.maxLabel, "35° or more");
  assert.equal(lg.gradientCss, "linear-gradient(to right, rgb(0,255,0), rgb(255,255,0), rgb(255,0,0))");
  assert.match(lg.title, /degrees/);
  assert.match(lg.note, /no Go \/ Caution \/ Avoid classes/); // only ever mentioned as absent
});

test("legendFor('slope') without a colormap shows no invented range", () => {
  const lg = legendFor("slope", { layers: [{ id: "slope", name: "Slope" }] }, null);
  assert.equal(lg.gradientCss, null);
  assert.equal(lg.minLabel, null);
});

test("legendFor returns null for an unknown layer", () => {
  assert.equal(legendFor("nope", current, null), null);
  assert.equal(legendFor("photo", current, null), null);
});

test("hazard legend says model, not validated; gradient = hazard.png formula on the real set", () => {
  const meta = JSON.parse(readFileSync(join(repo, "samples/out/hazard.meta.json"), "utf8"));
  const real = legendFor("hazard", current, meta);
  assert.equal(real.title, HAZARD_TITLE);
  assert.match(real.title, /model, not validated/);
  assert.match(real.gradientCss, /rgba\(255,220,30,0\) 0%.*rgba\(255,165,30,0\.314\) 25%.*rgba\(255,82,30,0\.784\) 62\.5%.*rgba\(255,0,30,0\.784\) 100%/);
  assert.match(real.note, /never blocks/);
  const sample = legendFor("hazard", null, meta);
  assert.match(sample.title, /model, not validated/);
  assert.match(sample.note, /SAMPLE/);
});

test("science legend wording", () => {
  const lg = legendFor("science", upcoming() || current, null);
  assert.match(lg.title, /relative signal strength \(0–1\)/);
  assert.match(lg.note, /CRISM browse products/);
  assert.match(lg.note, /signs of minerals, not proof/);
});

test("legendHtml escapes and omits the ramp when there is no gradient", () => {
  const h = legendHtml({ title: "<x>", gradientCss: null, minLabel: null, maxLabel: null, note: "n & m" });
  assert.ok(h.includes("&lt;x&gt;") && h.includes("n &amp; m"));
  assert.ok(!h.includes("src-ramp"));
});
