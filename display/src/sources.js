// Written with AI assistance (Claude).
// "Data sources" panel section + map legends for the raster overlays.
// RULE: nothing here is invented. Names, sources, licences, citations and units come from layers.manifest.json /
// hazard.meta.json. Each legend gradient reproduces the colour formula that really rendered the PNG:
//   real set (layers.manifest.json present, files from terrain/out/):
//     slope, rough, dem  -> terrain/build_terrain.py png() lines 50-58, called at lines 198-200
//     science            -> terrain/build_science.py lines 55-58 (origin/main, origin/p2-terrain)
//     hazard             -> no PNG renderer in the repo yet: no gradient, name + "see source"
//   sample set (no layers.manifest.json, files from samples/out/):
//     all layers         -> samples/make_samples.py save() lines 40-50
// The colours were checked against the PNGs pixel by pixel (end colours and channel ratios match).
// No Go/Caution/Avoid classes anywhere: no thresholds are published.
//
// sources.css is NOT imported here (keeps `node --test` DOM-free); main.js imports it.
// Leaflet touches `window` when imported, so it is loaded only in a browser (same pattern as proof.js).

const BROWSER = typeof window !== "undefined" && typeof document !== "undefined";
const L = BROWSER ? (await import("leaflet")).default : null;

export const SAMPLE_SOURCES_MSG = "Sample data — synthetic, not NASA data.";
export const HAZARD_TITLE = "AI hazard estimate (model, not validated)";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const grad = (...stops) => `linear-gradient(to right, ${stops.join(", ")})`;

// Colour formulas, g = 0..1 (value stretched between the script's lo and hi). All are piecewise linear in g,
// so a CSS gradient through these stops reproduces them exactly.
const GREY = grad("rgb(0,0,0)", "rgb(255,255,255)");                       // rgb = (g, g, g)
// build_terrain.py:52-53 "slope": (clip(2g), clip(2-2g), 0) -> green, yellow at g = 0.5, red
const SLOPE_GYR = grad("rgb(0,255,0)", "rgb(255,255,0)", "rgb(255,0,0)");
// build_terrain.py:54-55 "mars": (g, 0.55g + 0.1, 0.35g + 0.05)
const DEM_MARS_REAL = grad("rgb(0,26,13)", "rgb(255,166,102)");
// make_samples.py:45 "mars": (g, 0.6g, 0.4g)
const DEM_MARS_SAMPLE = grad("rgb(0,0,0)", "rgb(255,153,102)");
// build_science.py:56-57: (g, 0.85g, 0.25(1-g)) with g = score / max(score)
const SCIENCE_REAL = grad("rgb(0,0,64)", "rgb(255,217,0)");

const SCIENCE_NOTE = "Relative signal strength (0–1) from CRISM browse products. Orbital data shows signs of minerals, not proof.";
const NO_CLASSES = "Continuous colour only; no Go / Caution / Avoid classes (no thresholds are published).";

const entry = (manifest, id) => manifest?.layers?.find((l) => l.id === id) || null;
const fmtNum = (s) => String(Number(s));

// "0-35 deg green-red" (manifest colormap) -> ["0", "35"]; null if the string doesn't say.
function degRange(colormap) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*deg\b/.exec(String(colormap ?? ""));
  return m ? [fmtNum(m[1]), fmtNum(m[2])] : null;
}

function hazardLegend(manifest, hazardMeta) {
  const who = hazardMeta && hazardMeta.model ? ` Model ${hazardMeta.model}${hazardMeta.version ? `, version ${hazardMeta.version}` : ""}.` : "";
  if (!manifest) {
    // samples/make_samples.py:50 save("hazard", hazard, 0, 1) -> grey
    return { title: HAZARD_TITLE, gradientCss: GREY, minLabel: "0", maxLabel: "1",
      note: `SAMPLE data. Darker = lower, brighter = higher.${who}` };
  }
  return { title: HAZARD_TITLE, gradientCss: null, minLabel: null, maxLabel: null,
    note: `Colour scale: see source.${who}` };
}

/**
 * Legend for one raster overlay. `manifest` null = the sample data set (samples/out has no manifest).
 * @returns {{title:string, gradientCss:string|null, minLabel:string|null, maxLabel:string|null, note:string}|null}
 */
export function legendFor(layerId, manifest, hazardMeta) {
  const sample = !manifest;
  const e = entry(manifest, layerId);
  const name = (fallback) => e?.name || fallback;
  switch (layerId) {
    case "slope": {
      if (sample) { // make_samples.py:49 save("slope", slope, 0, 35) -> grey
        return { title: "Slope (degrees)", gradientCss: GREY, minLabel: "0°", maxLabel: "35°",
          note: `SAMPLE data. Darker = flatter, brighter = steeper. ${NO_CLASSES}` };
      }
      // Range from the manifest colormap ("0-35 deg green-red"), which build_terrain.py:199 renders (0, 35, "slope").
      const r = degRange(e?.colormap);
      if (!r) return { title: `${name("Slope")} (degrees)`, gradientCss: null, minLabel: null, maxLabel: null, note: "Colour scale: see source." };
      return { title: `${name("Slope")} (degrees)`, gradientCss: SLOPE_GYR, minLabel: `${r[0]}°`, maxLabel: `${r[1]}° or more`,
        note: `Green = flatter, red = steeper. ${NO_CLASSES}` };
    }
    case "rough": {
      if (sample) { // make_samples.py:49 save("rough", rough) -> grey, min..max
        return { title: "Roughness (m)", gradientCss: GREY, minLabel: "lowest", maxLabel: "highest",
          note: "SAMPLE data. Darker = lower, brighter = higher." };
      }
      // build_terrain.py:200 png(rough, 0, percentile(rough, 99)) -> grey
      const u = e?.units ? ` (${e.units})` : "";
      return { title: `${name("Roughness")}${u}`, gradientCss: GREY, minLabel: `0${e?.units ? " " + e.units : ""}`,
        maxLabel: "99th percentile of this area or more", note: `${e?.source ? e.source + ". " : ""}Darker = smoother, brighter = rougher.` };
    }
    case "dem": {
      if (sample) { // make_samples.py:48 save("dem", dem, cmap="mars") -> min..max
        return { title: "Elevation", gradientCss: DEM_MARS_SAMPLE, minLabel: "lowest", maxLabel: "highest",
          note: "SAMPLE data. Darker = lower, brighter = higher." };
      }
      // build_terrain.py:198 png(z, nanmin(z), nanmax(z), "mars")
      return { title: name("Elevation"), gradientCss: DEM_MARS_REAL, minLabel: "lowest in this area", maxLabel: "highest in this area",
        note: "Darker = lower, brighter = higher." };
    }
    case "science": {
      const title = "Science value — relative signal strength (0–1)";
      if (sample) { // make_samples.py:50 save("science", science, 0, 1) -> grey
        return { title, gradientCss: GREY, minLabel: "0", maxLabel: "1", note: `SAMPLE data. Darker = lower, brighter = higher.` };
      }
      // build_science.py:56-57: brightness is score / max(score), so the top colour is this area's highest value.
      return { title, gradientCss: SCIENCE_REAL, minLabel: "0", maxLabel: "highest in this area", note: SCIENCE_NOTE };
    }
    case "hazard":
      return hazardLegend(manifest, hazardMeta);
    default:
      return null;
  }
}

/** Only http(s) URLs become links; returns { href, rest } or null. */
function splitUrl(citation) {
  const m = /^\s*(https?:\/\/[^\s<>"']+)(.*)$/i.exec(String(citation ?? ""));
  return m ? { href: m[1], rest: m[2].trim() } : null;
}

function citationHtml(citation) {
  if (!citation) return `<span class="muted">none given</span>`;
  const u = splitUrl(citation);
  if (!u) return `<span class="src-cite-text">${esc(citation)}</span>`;
  return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(u.href)}</a>${u.rest ? " " + esc(u.rest) : ""}`;
}

function rowHtml(r) {
  return `<li class="src-row">
      <div class="src-name">${esc(r.name)}</div>
      <div class="src-line"><span class="src-k">Source</span> ${esc(r.source || "not given")}</div>
      <div class="src-line"><span class="src-k">Licence</span> ${esc(r.licence || "not given")}</div>
      <div class="src-line"><span class="src-k">Citation</span> ${citationHtml(r.citation)}</div>
    </li>`;
}

/** Pure HTML: one row per manifest layer, then `extra` rows. Everything escaped; only http(s) links. */
export function sourcesHtml(manifest, { extra = [] } = {}) {
  const rows = [...(manifest?.layers || []), ...(extra || [])].filter((r) => r && r.name);
  if (!rows.length) return `<p class="muted">No data sources listed.</p>`;
  return `<ul class="src-list">${rows.map(rowHtml).join("")}</ul>`;
}

/** Fills a <section> with the heading and the list (or the sample notice). */
export function renderSources(container, manifest, opts = {}) {
  if (!container) return;
  container.innerHTML = manifest
    ? `<h2>Data sources</h2>${sourcesHtml(manifest, opts)}`
    : `<h2>Data sources</h2><p class="muted">${esc(SAMPLE_SOURCES_MSG)}</p>`;
}

/** HTML for one legend block (used by the map control). */
export function legendHtml(lg) {
  if (!lg) return "";
  const ramp = lg.gradientCss ? `<div class="src-ramp" style="background:${esc(lg.gradientCss)}"></div>` : "";
  const ends = lg.gradientCss && (lg.minLabel || lg.maxLabel)
    ? `<div class="src-ends"><span>${esc(lg.minLabel ?? "")}</span><span>${esc(lg.maxLabel ?? "")}</span></div>` : "";
  return `<div class="src-legend"><div class="src-legend-title">${esc(lg.title)}</div>${ramp}${ends}${lg.note ? `<div class="src-legend-note">${esc(lg.note)}</div>` : ""}</div>`;
}

/**
 * Leaflet control (bottomright, above the attribution) with the legends of the raster overlays that are on.
 * overlays: { [displayName]: { id, layer } }. Hidden when none is on. Returns { destroy() }.
 */
export function initLegendControl(map, { manifest = null, hazardMeta = null, overlays = {} } = {}) {
  if (!L || !map) return { destroy() {} };
  const items = Object.values(overlays || {}).filter((o) => o && o.layer && legendFor(o.id, manifest, hazardMeta));
  let div = null;
  const update = () => {
    if (!div) return;
    const on = items.filter((o) => map.hasLayer(o.layer));
    div.innerHTML = on.map((o) => legendHtml(legendFor(o.id, manifest, hazardMeta))).join("");
    div.style.display = on.length ? "" : "none";
  };
  const Legend = L.Control.extend({
    options: { position: "bottomright" },
    onAdd() {
      div = L.DomUtil.create("div", "src-legend-control");
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  const control = new Legend().addTo(map); // bottom corners stack new controls above existing ones (attribution)
  // layeradd/layerremove cover both the layers control and code that adds/removes an overlay directly.
  const onChange = (ev) => { if (items.some((o) => o.layer === ev.layer)) update(); };
  map.on("layeradd layerremove", onChange);
  update();
  return {
    destroy() {
      map.off("layeradd layerremove", onChange);
      control.remove();
      div = null;
    },
  };
}
