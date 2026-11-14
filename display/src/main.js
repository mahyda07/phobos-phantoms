// Written with AI assistance (Claude).
// Web map: HiRISE photo + terrain overlays + Perseverance's path on the jezero-local-v1 grid (Leaflet CRS.Simple).
// Every number shown comes from the files in public/data/ (copied by scripts/copy-data.mjs).
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { loadFrame } from "./frame.js";

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
  const fit = () => map.fitBounds(bounds);
  fit();

  // Base layer: the HiRISE photo on the grid.
  L.imageOverlay(DATA + "photo.png", bounds, { attribution: attributionFor(manifest, "photo") }).addTo(map);

  // Overlays: off by default, pixelated, only listed if the file is really there.
  const overlays = {};
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
  });

  // Perseverance's real path (local metres [x, y] -> Leaflet [lat, lng]).
  const rover = await getJson("rover_path.json");
  if (rover?.features?.length) {
    const lines = rover.features
      .filter((ft) => ft.geometry?.type === "LineString")
      .map((ft) => ft.geometry.coordinates.map(([x, y]) => f.localToLeaflet(x, y)));
    const roverLayer = L.polyline(lines, { color: "#7cc7ff", weight: 3, opacity: 0.95, interactive: false,
      attribution: attributionFor(manifest, "rover") || "Rover path: NASA/JPL-Caltech" });
    roverLayer.addTo(map);
    overlays["Perseverance path (real, NASA/JPL-Caltech)"] = roverLayer;
  }

  // ROUTE: planned route (data/route.json) is drawn here in the next task. Do not draw it before then.

  L.control.layers(null, overlays, { collapsed: false, position: "topright" }).addTo(map);
  addScaleBar(map, f.cell);

  // Re-fit once layout has settled (first-load mis-zoom fix).
  requestAnimationFrame(() => { map.invalidateSize(); fit(); });
  window.addEventListener("resize", () => map.invalidateSize());
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById("error");
  el.textContent = "Could not load map data: " + err.message + " (run npm run copy-data)";
  el.hidden = false;
});
