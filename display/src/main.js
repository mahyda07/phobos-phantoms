// Written with AI assistance (Claude).
// Web map: HiRISE photo + terrain overlays + Perseverance's path on the jezero-local-v1 grid (Leaflet CRS.Simple).
// Every number shown comes from the files in public/data/ (copied by scripts/copy-data.mjs).
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { loadFrame } from "./frame.js";
import { drawRoute, checkRoute, routeKind, rampColor } from "./route.js";
import { renderNoRoute, renderRouteSummary, renderReadout, renderWindow, renderHud, renderConditions, setSlopeLimit } from "./panel.js";
import { costModelRow } from "./cost-model.js";
import { renderStopCards, highlightStopCard, stopsFromCsv, parseCsv } from "./stop-cards.js";
import stopPhotos from "./stop-photos.json";
import "./stop-cards.css";
import { renderProofPanel, initProofToggle, parseWaypointsCsv } from "./proof.js";
import { initPlannerControl, buildPlanRequest, requestPlan, wakePlanner } from "./planner.js";
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
import { initCompare } from "./compare.js";
import "./compare.css";
import { initExport } from "./export.js";
import "./export.css";
import { initBriefing } from "./briefing.js";
import "./briefing.css";
import { initShare, readInitialState } from "./share.js";
import "./share.css";
import { initLocator, MARS_GLOBAL } from "./locator.js";
import "./locator.css";
import { initLiveFeeds, MEDA_URL } from "./live-feeds.js";
import { loadFeeds, feedsCardHtml, lightToday } from "./feeds.js";
import { initSound } from "./sound.js";
import "./live-feeds.css";
import { initA11y } from "./a11y.js";
import "./view3d.css";
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
  let v3d = null;      // run 2: 3D terrain view (view3d.js, loaded on first switch)
  let sound = null;    // run 2 Phase 5: map sound (sound.js), created below
  let lastPlanRequest = null; // set only while the drawn route came from the live planner (for share links)
  let exporter = null; // route downloads (created further down, refreshed whenever the route changes)
  const compare = initCompare(map, { L, f, container: document.getElementById("compare") }); // previous vs new planner route
  let routeLL = [];   // current route in Leaflet coordinates (for the moving-map control)
  let mm = null;      // moving-map control: play along the route, follow, distance rings
  let profile = null; // elevation profile chart in the side panel
  let posIndex = 0; // the position (arrow). Hover only previews; click / slider / Play / keys move the position.
  const showPoint = (i) => {
    if (!view) return;
    posIndex = i;
    view.clearGhost();
    slider.value = i;
    slider.setAttribute("aria-valuetext", `Point ${i + 1} of ${Number(slider.max) + 1}`);
    view.setPoint(i);
    v3d?.setPoint(i);
    mm?.setIndex(i);
    profile?.setPoint(i);
    const next = view.stops.find((s) => s.vertex >= i) || null;
    renderReadout(current, i, next);
    renderHud(current, i, next);
  };
  const nextStopAt = (i) => view?.stops.find((s) => s.vertex >= i) || null;
  const previewPoint = (i) => {
    if (!view) return;
    view.setGhost(i);
    renderReadout(current, i, nextStopAt(i), { preview: true, pos: posIndex });
    renderHud(current, i, nextStopAt(i), { preview: true });
  };
  const endPreview = () => {
    if (!view) return;
    view.clearGhost();
    renderReadout(current, posIndex, nextStopAt(posIndex));
    renderHud(current, posIndex, nextStopAt(posIndex));
  };
  slider.addEventListener("input", () => showPoint(Number(slider.value)));
  const showStops = (stops, onSelect) => renderStopCards(stopsEl, stops, photos, { onSelect });

  const showRoute = (route) => {
    if (view) { layersControl.removeLayer(view.layer); view.layer.remove(); view = null; }
    current = route;
    v3d?.setRoute(route);
    sound?.play("route");
    const onStop = (id) => { highlightStopCard(stopsEl, id); view?.focusStop(id); };
    view = drawRoute(map, f, route, { onPoint: showPoint, onPreview: previewPoint, onPreviewEnd: endPreview, onStop });
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
    profile = renderProfile(profileEl, route, { stops: view.stops, onPoint: showPoint, onPreview: previewPoint, onPreviewEnd: endPreview });
    profileEl.hidden = false;
    showPoint(0);
    setupProof(route, view.layer);
    exporter?.refresh();
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
    current = null;
    lastPlanRequest = null;
    compare.clear();
    exporter?.refresh();
  };
  if (saved && !savedError) showRoute(saved);
  else noRoute(saved ? "Route not drawn: " + savedError
    : "No planned route yet. Showing the terrain, the science stops and Perseverance's real path until the planner's route.json arrives.");

  // Live planner (POST /plan). On failure the saved route (if any) stays: it is the offline demo route.
  const onPlannerRoute = (route, { source, reason, request }) => {
    if (source === "planner" && route) {
      if (current) compare.setRoutes(current, route); // keep the previous route as a dashed line + side-by-side numbers
      showRoute(route);
      lastPlanRequest = request || null;
      routeSource.textContent = "Route from the live planner.";
    } else {
      routeSource.textContent = saved && !savedError
        ? `Planner unavailable (${reason}) — showing the saved offline demo route.`
        : `Planner unavailable (${reason}) — no saved route to fall back to yet.`;
    }
    routeSource.hidden = false;
  };
  wakePlanner(); // the free Render server sleeps when idle: start waking it while the visitor reads the welcome
  initPlannerControl(map, f, {
    stops: (csvStops.length ? csvStops : saved?.properties?.stops || []).map((s) => ({ id: s.id, name: s.name })),
    onRoute: onPlannerRoute,
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
  // ---- run 2 (Phase 3): 2D / 3D switch + keyboard actions (a11y.js keyAction: 2 3 P H G L R + -) ----
  const v3dHost = document.createElement("div");
  v3dHost.id = "view3d"; v3dHost.hidden = true;
  v3dHost.innerHTML = `<div class="v3d-bar glass" role="group" aria-label="3D view controls">
      <label class="v3d-exag"><span id="v3d-exag-label">Vertical exaggeration 1.5×</span>
        <input id="v3d-exag" type="range" min="1" max="3" step="0.1" value="1.5" aria-describedby="v3d-exag-label"></label>
      <button type="button" class="chip" id="v3d-hazard" aria-pressed="false">AI hazard</button>
      <button type="button" class="chip" id="v3d-rover" aria-pressed="true">Perseverance path</button>
      <button type="button" class="chip" id="v3d-reset">Reset view</button>
    </div>
    <div class="v3d-hint">Drag to orbit · scroll to zoom · W A S D pan · Q / E rotate</div>
    <div class="v3d-loading" role="status">Loading 3D terrain…</div>`;
  document.getElementById("map").appendChild(v3dHost);
  const toggleEl = document.getElementById("view-toggle");
  const setPressed = (id, on) => document.getElementById(id)?.setAttribute("aria-pressed", String(!!on));
  let switching = false;
  async function setView(mode) {
    if (switching) return null;
    const want3d = mode === "3d";
    toggleEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === mode)));
    if (!want3d) { v3d?.hide(); v3dHost.hidden = true; document.body.classList.remove("view-3d"); return "2D map"; }
    document.body.classList.add("view-3d"); v3dHost.hidden = false;
    if (!v3d) {
      switching = true; v3dHost.classList.add("loading");
      try {
        const [{ createView3D }, meta] = await Promise.all([import("./view3d.js"), getJson("terrain.meta.json")]);
        const roverJson = await getJson("rover_path.json");
        const stops3d = (current?.properties?.stops?.length ? current.properties.stops : csvStops).map((st) => ({ id: st.id, name: st.name, x: st.x, y: st.y }));
        v3d = await createView3D(v3dHost, { f, data: DATA, meta, route: current, rover: roverJson, stops: stops3d, rampColor });
        v3d.setRover(!!roverLayer && map.hasLayer(roverLayer));
        v3d.setPoint(posIndex);
        window.__v3d = v3d;   // read by qa scripts (lod / draw calls)
      } catch (e) {
        console.error(e); switching = false; setView("2d"); { const er = document.getElementById("error"); er.textContent = `3D view could not load: ${e.message}`; er.hidden = false; } switching = false; v3dHost.classList.remove("loading"); return "3D view could not load";
      }
      switching = false; v3dHost.classList.remove("loading");
    }
    v3d.show();
    setPressed("v3d-hazard", v3d.hazard); setPressed("v3d-rover", v3d.rover);
    return "3D terrain view";
  }
  toggleEl.addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (b) setView(b.dataset.view); });
  v3dHost.querySelector("#v3d-exag").addEventListener("input", (e) => { const t = v3d?.setExag(e.target.value); if (t) document.getElementById("v3d-exag-label").textContent = t; });
  const hazardName = Object.keys(rasterInfo).find((k) => rasterInfo[k].id === "hazard");
  const toggleHazard = () => {
    if (v3d?.visible) { const on = v3d.setHazard(!v3d.hazard); setPressed("v3d-hazard", on); return `AI hazard layer ${on ? "on" : "off"}`; }
    const lay = hazardName && overlays[hazardName]; if (!lay) return "No AI hazard layer in this data set";
    if (map.hasLayer(lay)) map.removeLayer(lay); else lay.addTo(map);
    return `AI hazard layer ${map.hasLayer(lay) ? "on" : "off"}`;
  };
  const toggleRover = () => {
    if (!roverLayer) return "No Perseverance path in this data set";
    const on = !map.hasLayer(roverLayer);
    if (on) roverLayer.addTo(map); else map.removeLayer(roverLayer);
    v3d?.setRover(on); setPressed("v3d-rover", on);
    return `Perseverance path ${on ? "on" : "off"}`;
  };
  v3dHost.querySelector("#v3d-hazard").addEventListener("click", toggleHazard);
  v3dHost.querySelector("#v3d-rover").addEventListener("click", toggleRover);
  v3dHost.querySelector("#v3d-reset").addEventListener("click", () => v3d?.reset());
  const layersEl = () => document.querySelector(".leaflet-control-layers");
  sound = initSound({ button: document.getElementById("sound-toggle") });   // run 2 Phase 5: off by default
  const actions = {
    sound: () => `Sound ${sound.toggle() ? "on" : "off"}`,
    view2: () => { setView("2d"); return "2D map"; },
    view3: () => { setView("3d"); return "Loading the 3D terrain view"; },
    plan: () => { if (v3d?.visible) setView("2d"); document.querySelector(".planner-toggle")?.click(); return "Planner: click a start point, then an end point"; },
    hazard: toggleHazard,
    ghost: toggleRover,
    layers: () => { const el = layersEl(); if (!el) return null; el.classList.toggle("is-hidden"); const open = !el.classList.contains("is-hidden"); if (open) el.querySelector("input")?.focus(); return `Layers list ${open ? "shown" : "hidden"}`; },
    reset: () => { if (v3d?.visible) v3d.reset(); else fit(); return "View reset"; },
    zoomIn: () => { if (v3d?.visible) v3d.zoom(0.85); else map.zoomIn(); return null; },
    zoomOut: () => { if (v3d?.visible) v3d.zoom(1.15); else map.zoomOut(); return null; },
  };
  initA11y({ getIndex: () => Number(slider.value), setIndex: showPoint, pointCount: () => (view ? routeLL.length : 0), clickByClass, actions });

  // Legends for the raster overlays that are switched on, and the data sources list.
  const hazardMeta = await getJson("hazard.meta.json");
  initLegendControl(map, { manifest: isSample ? null : manifest, hazardMeta, overlays: rasterInfo, slopeLimit });
  renderSources(document.getElementById("sources"), isSample ? null : manifest, {
    extra: isSample ? [] : [{ name: "Perseverance raw images (stop photos)", source: "NASA/JPL-Caltech",
      licence: "NASA media guidelines", citation: "https://mars.nasa.gov/mars2020/multimedia/raw-images/" },
    { name: "Where on Mars? inset (global map)", source: MARS_GLOBAL.credit, licence: MARS_GLOBAL.licence, citation: MARS_GLOBAL.source },
    { name: "Live card: Perseverance MEDA weather feed", source: "NASA/JPL-Caltech public weather feed (last updated sol 1133, 2024-04-27)", licence: "NASA data, public", citation: MEDA_URL },
    { name: "Live card: space-weather notifications", source: "NASA CCMC DONKI via api.nasa.gov (public DEMO_KEY)", licence: "NASA data, public", citation: "https://api.nasa.gov/" }],
  });

  const win = await getJson("window.json");
  const feeds = await loadFeeds(getJson);   // run 2: build-time context feeds (optional)
  renderWindow(win, { lightToday: lightToday(feeds.horizons) });
  let conditionRows = [];
  // Hourly conditions (Mahida's conditions.csv): temperature, pressure, dust, radiation, exactly as in the file.
  const condText = await getText("conditions.csv");
  if (condText) {
    const [head, ...rows] = parseCsv(condText);
    conditionRows = rows.map((r) => Object.fromEntries(head.map((h, k) => [h, r[k]])));
    renderConditions(document.getElementById("window"), conditionRows);
  }

  // Route downloads (GeoJSON / CSV, exactly the route shown) and the printable one-page EVA briefing.
  exporter = initExport(document.getElementById("download-tools"), () => current);
  initBriefing(document.getElementById("briefing-tools"), () => ({
    route: current, stops: view ? view.stops : csvStops, photos, win, conditions: conditionRows,
    slopeLimit, manifest: isSample ? null : manifest, isSample,
  }));
  addScaleBar(map, f.cell);
  initLiveFeeds(document.getElementById("live"), { cachedDonki: feeds.donki }); // not awaited, never blocks the map
  { const card = document.createElement("div"); card.className = "feeds-card"; card.innerHTML = feedsCardHtml(feeds); document.getElementById("sources")?.appendChild(card); }
  initLocator(map, { L, grid: gridRaw, isSample }); // after the scale bar so it stacks above it

  // Re-fit once layout has settled (first-load mis-zoom fix).
  // Shareable link: "Copy link to this view" stores the view in the URL hash (#p=…&z=…); opening such a link restores it.
  const layerById = () => {
    const m = {};
    for (const { id, layer } of Object.values(rasterInfo)) m[id] = layer;
    if (roverLayer) m.rover = roverLayer;
    if (csvStopLayer) m.stops = csvStopLayer;
    if (view) m.route = view.layer;
    return m;
  };
  const proofBtn = () => document.querySelector(".proof-toggle button");
  const getState = () => {
    const c = map.getCenter();
    const st = {
      zoom: map.getZoom(), center: [c.lat, c.lng],
      layers: Object.entries(layerById()).filter(([, l]) => map.hasLayer(l)).map(([id]) => id),
      proof: proofBtn()?.getAttribute("aria-pressed") === "true",
    };
    if (view) st.point = Number(slider.value);
    if (lastPlanRequest) Object.assign(st, { start: lastPlanRequest.start, end: lastPlanRequest.end,
      stops: lastPlanRequest.stops, useHazard: lastPlanRequest.use_hazard });
    return st;
  };
  const replan = async ({ start, end, stops = [], useHazard = true }) => {
    let body;
    try { body = buildPlanRequest({ start, end, stops, useHazard }); } catch { return; }
    if (!f.inside(start[0], start[1]) || !f.inside(end[0], end[1])) return;
    routeSource.textContent = "Planning the route from the shared link… (free server, can take a few seconds)";
    routeSource.hidden = false;
    const res = await requestPlan(body);
    const err = res.ok ? checkRoute(res.route, f) : "fail";
    if (!err) onPlannerRoute(res.route, { source: "planner", request: body });
    else onPlannerRoute(null, { source: "fallback", reason: res.ok ? "bad-reply" : res.reason });
  };
  const applyState = async (st) => {
    if (st.start && st.end) await replan(st); // first: showRoute resets the point, proof and route overlay
    const byId = layerById();
    if (st.layers) for (const [id, layer] of Object.entries(byId)) {
      const on = st.layers.includes(id);
      if (on && !map.hasLayer(layer)) map.addLayer(layer);
      if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    }
    if (st.proof !== undefined) {
      const b = proofBtn();
      if (b && (b.getAttribute("aria-pressed") === "true") !== st.proof) b.click();
    }
    if (st.zoom !== undefined || st.center) {
      const z = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), st.zoom ?? map.getZoom()));
      map.setView(st.center || map.getCenter(), z, { animate: false });
    }
    if (view && st.point !== undefined) showPoint(Math.min(st.point, Number(slider.max)));
  };
  initShare(map, { getState, applyState, container: document.getElementById("briefing-tools") });

  // After layout: next animation frame, or 250 ms if the tab is in the background (browsers pause frames there).
  let laidOut = false;
  const afterLayout = () => {
    if (laidOut) return;
    laidOut = true;
    map.invalidateSize(); fit();
    const init = readInitialState(); // after fit(), so a shared view's zoom/centre are not overwritten
    if (init) applyState(init).catch((e) => console.warn("Share link:", e));
  };
  requestAnimationFrame(afterLayout);
  setTimeout(afterLayout, 250);
  window.addEventListener("resize", () => map.invalidateSize());
}

initWelcome();
main().catch((err) => {
  console.error(err);
  const el = document.getElementById("error");
  el.textContent = "Could not load map data: " + err.message + " (run npm run copy-data)";
  el.hidden = false;
});
