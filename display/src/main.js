// Written with AI assistance (Claude).
// Web map: HiRISE photo + terrain overlays + Perseverance's path on the jezero-local-v1 grid (Leaflet CRS.Simple).
// Every number shown comes from the files in public/data/ (copied by scripts/copy-data.mjs).
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { loadFrame } from "./frame.js";
import { drawRoute, checkRoute, routeKind } from "./route.js";
import { renderNoRoute, renderRouteSummary, renderReadout, renderWindow, renderHud, renderConditions, setSlopeLimit } from "./panel.js";
import { costModelRow } from "./cost-model.js";
import { renderStopCards, highlightStopCard, stopsFromCsv, parseCsv } from "./stop-cards.js";
import stopPhotos from "./stop-photos.json";
import "./stop-cards.css";
import { renderProofPanel, initProofToggle, parseWaypointsCsv } from "./proof.js";
import { initPlannerControl } from "./planner.js";
import { initMovingMap } from "./moving-map.js";
import "./moving-map.css";
import { renderSources, initLegendControl } from "./sources.js";
import "./sources.css";
import { renderProfile } from "./profile.js";
import "./profile.css";
import "./theme.css"; // Marswalk look (matches the headset page)
import { initWelcome } from "./welcome.js";
import { renderStretches } from "./proof-stretches.js";
import "./proof-stretches.css";
import { initDemo } from "./demo.js";
import "./demo.css";
import { initA11y } from "./a11y.js";
import "./a11y.css"; // after theme.css: focus rings, contrast fixes
import "./responsive.css"; // keep last: phone/tablet overrides

const DATA = "data/";
const OVERLAY_OPACITY = 0.6;

// Vite's dev/preview servers answer missing files with index.html (200), so check the content type too.
async function fileExists(name, typePrefix) {
  try {
    const r = await fetch(DATA + name, { method: "HEAD" });
    return r.ok && (r.headers.get("content-type") || "").startsWith(typePrefix);
  } catch { return false; }
}
async function getJson(name) {
  try {
    const r = await fetch(DATA + name);
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch { return null; }
}

// Text files (csv, md). Same index.html-for-missing-files guard as getJson.
async function getText(name) {
  try {
    const r = await fetch(DATA + name);
    if (!r.ok || (r.headers.get("content-type") || "").includes("html")) return null;
    return await r.text();
  } catch { return null; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
// Attribution for one manifest layer: "<source> (<citation link>)".
function attributionFor(manifest, id) {
  const e = manifest?.layers?.find((l) => l.id === id);
  if (!e) return undefined;
  const cite = e.citation ? ` (<a href="${escapeHtml(e.citation)}" target="_blank" rel="noopener">source</a>)` : "";
  return `${escapeHtml(e.name)}: ${escapeHtml(e.source)}${cite}`;
}

// Scale bar for CRS.Simple: 1 map unit = 1 cell = f.cell metres; at zoom z one unit is 2^z screen pixels.
function addScaleBar(map, cellM) {
  const ScaleBar = L.Control.extend({
    options: { position: "bottomleft", maxWidth: 120 },
    onAdd() {
      this._div = L.DomUtil.create("div", "scale-bar");
      map.on("zoomend", () => this._update());
      this._update();
      return this._div;
    },
    _update() {
      const mPerPx = cellM / Math.pow(2, map.getZoom());
      const maxM = mPerPx * this.options.maxWidth;
      const p = Math.pow(10, Math.floor(Math.log10(maxM)));
      const nice = [5, 2, 1].map((k) => k * p).find((v) => v <= maxM);
      const px = nice / mPerPx;
      const label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
      this._div.innerHTML = `${label}<div class="bar" style="width:${Math.round(px)}px"></div>`;
    },
  });
  new ScaleBar().addTo(map);
}

async function main() {
  const gridRaw = await fetch(DATA + "grid.json").then((r) => r.json());
  const f = await loadFrame(DATA + "grid.json");
  const isSample = /SAMPLE/.test(String(gridRaw.projection_wkt)) || /SAMPLE/.test(String(gridRaw.source_dtm));
  const manifest = await getJson("layers.manifest.json");

  document.getElementById("grid-size").textContent = `${f.width} × ${f.height} cells · ${f.cell} m`;
  if (isSample) document.getElementById("sample-badge").hidden = false;

  const map = L.map("map", { crs: L.CRS.Simple, minZoom: -3, maxZoom: 4, zoomSnap: 0.25, attributionControl: true });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  if (isSample || !manifest) map.attributionControl.addAttribution("SAMPLE data — synthetic, not NASA data");

  const bounds = f.leafletBounds();
  const fit = () => map.fitBounds(bounds, { paddingTopLeft: [0, 70], paddingBottomRight: [0, 10] }); // keep pins clear of the title box
  fit();

  // Base layer: the HiRISE photo on the grid.
  L.imageOverlay(DATA + "photo.png", bounds, { attribution: attributionFor(manifest, "photo") }).addTo(map);

  // Overlays: off by default, pixelated, only listed if the file is really there.
  const overlays = {};
  const rasterInfo = {}; // { [displayName]: { id, layer } } for the legend control
  const rasterOverlays = [
    ["slope", "Slope"], ["rough", "Roughness"], ["dem", "Elevation"],
    ["hazard", "Hazard"], ["science", "Science"],
  ];
  const present = await Promise.all(rasterOverlays.map(([id]) => fileExists(id + ".png", "image/")));
  rasterOverlays.forEach(([id, fallbackName], i) => {
    if (!present[i]) return;
    const name = manifest?.layers?.find((l) => l.id === id)?.name || fallbackName;
    overlays[name] = L.imageOverlay(DATA + id + ".png", bounds, {
      opacity: OVERLAY_OPACITY, className: "data-layer", attribution: attributionFor(manifest, id),
    });
    rasterInfo[name] = { id, layer: overlays[name] };
  });

  // Perseverance's real path (local metres [x, y] -> Leaflet [lat, lng]).
  const rover = await getJson("rover_path.json");
  let roverLayer = null;
  if (rover?.features?.length) {
    const lines = rover.features
      .filter((ft) => ft.geometry?.type === "LineString")
      .map((ft) => ft.geometry.coordinates.map(([x, y]) => f.localToLeaflet(x, y)));
    roverLayer = L.polyline(lines, { color: "#7cc7ff", weight: 3, opacity: 0.95, interactive: false,
      attribution: attributionFor(manifest, "rover") || "Rover path: NASA/JPL-Caltech" });
    roverLayer.addTo(map);
    overlays["Perseverance path (real, NASA/JPL-Caltech)"] = roverLayer;
  }

  // Science stops from stops.csv (Ramish's grid copy, or Mahida's science/stops.csv until it exists).
  const stopsCsv = await getText("stops.csv");
  const csvStops = stopsCsv ? stopsFromCsv(stopsCsv, f).filter((s) => f.inside(s.x, s.y)) : [];
  const stopsEl = document.getElementById("stops");
  // Photos were picked for the REAL stops S1–S5; sample stops reuse those ids, so never attach them on sample data.
  const photos = isSample ? {} : stopPhotos.photos || {};
  let csvStopLayer = null;
  const csvStopMarkers = {};
  if (csvStops.length) {
    csvStopLayer = L.layerGroup();
    for (const s of csvStops) {
      csvStopMarkers[s.id] = L.marker(f.localToLeaflet(s.x, s.y), {
        icon: L.divIcon({ className: "stop-pin", html: s.id, iconSize: [30, 30] }),
      }).bindTooltip(s.name).on("click", () => highlightStopCard(stopsEl, s.id)).addTo(csvStopLayer);
    }
    overlays["Science stops"] = csvStopLayer;
  }

  const layersControl = L.control.layers(null, overlays, { collapsed: false, position: "topright" }).addTo(map);
  const routeSource = document.getElementById("route-source");
  // Slope limit as published in docs/cost-model.md (shown only; the planner applies it, the display never does).
  const slopeLimit = isSample ? null : costModelRow(await getText("cost-model.md"), "Slope limit");
  setSlopeLimit(slopeLimit);
  const resultsMd = await getText("results.md");
  const resultsJson = await getJson("results.json"); // per-stretch proof numbers
  const wpText = await getText("rover_waypoints.csv");
  const waypoints = wpText ? parseWaypointsCsv(wpText) : null;
  let proofToggle = null;
  const setupProof = (routeOk, layer) => {
    renderProofPanel(document.getElementById("proof"), { rover, route: routeOk, resultsMd });
    renderStretches(document.getElementById("proof"), resultsJson); // re-added after every re-render
    proofToggle?.destroy();
    proofToggle = initProofToggle(map, f, { rover, roverLayer, routeLayer: layer, waypoints, onChange: () => {} });
  };

  // Planned route (route.json): drawn only if it belongs to this grid. Numbers come from route.json only.
  const slider = document.getElementById("point-slider");
  let view = null;
  let current = null;
  let routeLL = [];   // current route in Leaflet coordinates (for the moving-map control)
  let mm = null;      // moving-map control: play along the route, follow, distance rings
  let profile = null; // elevation profile chart in the side panel
  const showPoint = (i) => {
    if (!view) return;
    slider.value = i;
    slider.setAttribute("aria-valuetext", `Point ${i + 1} of ${Number(slider.max) + 1}`);
    view.setPoint(i);
    mm?.setIndex(i);
    profile?.setPoint(i);
    const next = view.stops.find((s) => s.vertex >= i) || null;
    renderReadout(current, i, next);
    renderHud(current, i, next);
  };
  slider.addEventListener("input", () => showPoint(Number(slider.value)));
  const showStops = (stops, onSelect) => renderStopCards(stopsEl, stops, photos, { onSelect });

  const showRoute = (route) => {
    if (view) { layersControl.removeLayer(view.layer); view.layer.remove(); view = null; }
    current = route;
    const onStop = (id) => { highlightStopCard(stopsEl, id); view?.focusStop(id); };
    view = drawRoute(map, f, route, { onPoint: showPoint, onStop });
    routeLL = route.geometry.coordinates.map(([x, y]) => f.localToLeaflet(x, y));
    mm?.setPointCount(routeLL.length);
    layersControl.addOverlay(view.layer, "Planned route");
    if (csvStopLayer) csvStopLayer.remove(); // the route's own stop pins replace the stops.csv pins
    const kind = routeKind(route);
    if (kind === "sample") document.getElementById("sample-badge").hidden = false;
    slider.max = route.geometry.coordinates.length - 1;
    renderRouteSummary(route, kind, view.maxMargin);
    showStops(view.stops.length ? view.stops : csvStops, onStop);
    const profileEl = document.getElementById("profile");
    profile = renderProfile(profileEl, route, { stops: view.stops, onPoint: showPoint });
    profileEl.hidden = false;
    showPoint(0);
    setupProof(route, view.layer);
  };

  const saved = await getJson("route.json");
  const savedError = saved ? checkRoute(saved, f) : null;
  const noRoute = (msg) => {
    renderNoRoute(msg);
    renderHud(null);
    profile = null;
    document.getElementById("profile").hidden = true;
    csvStopLayer?.addTo(map);
    showStops(csvStops, (id) => { highlightStopCard(stopsEl, id); const m = csvStopMarkers[id]; if (m) map.panTo(m.getLatLng()); });
    setupProof(null, null);
  };
  if (saved && !savedError) showRoute(saved);
  else noRoute(saved ? "Route not drawn: " + savedError
    : "No planned route yet. Showing the terrain, the science stops and Perseverance's real path until the planner's route.json arrives.");

  // Live planner (POST /plan). On failure the saved route (if any) stays: it is the offline demo route.
  initPlannerControl(map, f, {
    stops: (csvStops.length ? csvStops : saved?.properties?.stops || []).map((s) => ({ id: s.id, name: s.name })),
    onRoute: (route, { source, reason }) => {
      if (source === "planner" && route) {
        showRoute(route);
        routeSource.textContent = "Route from the live planner.";
      } else {
        routeSource.textContent = saved && !savedError
          ? `Planner unavailable (${reason}) — showing the saved offline demo route.`
          : `Planner unavailable (${reason}) — no saved route to fall back to yet.`;
      }
      routeSource.hidden = false;
    },
  });

  // Moving map (created after the planner so it sits under it): only useful when a route is drawn.
  mm = initMovingMap(map, f, { L, getPointLatLng: (i) => routeLL[i], pointCount: routeLL.length, onIndex: showPoint });
  if (routeLL.length) mm.setIndex(0);

  // Demo mode: one button runs the ~30 s walkthrough for the screen recording (demo.js).
  const demo = initDemo(map, {
    L, f,
    getRouteLatLngs: () => routeLL,
    pointCount: () => routeLL.length,
    setIndex: showPoint,
    stops: () => view?.stops || [],
    openSection: (id) => {
      const s = document.getElementById(id)?.closest("#panel > section");
      if (!s) return;
      s.classList.remove("mw-collapsed");
      s.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    clickProof: () => document.querySelector(".proof-toggle button")?.click(),
    closeWelcome: () => {
      const w = document.getElementById("mw-welcome");
      if (w && !w.classList.contains("out")) document.getElementById("mw-go")?.click();
    },
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("demo-running")) demo.stop(); });

  // Keyboard shortcuts + screen-reader helpers (a11y.js). "?" opens the shortcut list.
  const clickByClass = (cls) => {
    const el = document.querySelector("." + cls);
    const b = el && (el.matches("button") ? el : el.querySelector("button"));
    b?.click();
  };
  initA11y({ getIndex: () => Number(slider.value), setIndex: showPoint, pointCount: () => (view ? routeLL.length : 0), clickByClass });

  // Legends for the raster overlays that are switched on, and the data sources list.
  const hazardMeta = await getJson("hazard.meta.json");
  initLegendControl(map, { manifest: isSample ? null : manifest, hazardMeta, overlays: rasterInfo, slopeLimit });
  renderSources(document.getElementById("sources"), isSample ? null : manifest, {
    extra: isSample ? [] : [{ name: "Perseverance raw images (stop photos)", source: "NASA/JPL-Caltech",
      licence: "NASA media guidelines", citation: "https://mars.nasa.gov/mars2020/multimedia/raw-images/" }],
  });

  renderWindow(await getJson("window.json"));
  // Hourly conditions (Mahida's conditions.csv): temperature, pressure, dust, radiation, exactly as in the file.
  const condText = await getText("conditions.csv");
  if (condText) {
    const [head, ...rows] = parseCsv(condText);
    renderConditions(document.getElementById("window"), rows.map((r) => Object.fromEntries(head.map((h, k) => [h, r[k]]))));
  }
  addScaleBar(map, f.cell);

  // Re-fit once layout has settled (first-load mis-zoom fix).
  requestAnimationFrame(() => { map.invalidateSize(); fit(); });
  window.addEventListener("resize", () => map.invalidateSize());
}

initWelcome();
main().catch((err) => {
  console.error(err);
  const el = document.getElementById("error");
  el.textContent = "Could not load map data: " + err.message + " (run npm run copy-data)";
  el.hidden = false;
});
