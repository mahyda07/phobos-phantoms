// Written with AI assistance (Claude).
// Planned route (route.json) on the map. Every number comes from route.json; nothing is recomputed.
// The colour of each segment comes from per_vertex.margin_min on a continuous ramp (no thresholds exist yet:
// Go / Caution / Avoid only once docs/cost-model.md publishes them).
import L from "leaflet";

const RAMP = [[215, 48, 39], [240, 170, 40], [46, 170, 80]]; // red (0) -> amber -> green (largest margin on route)

/** t in 0..1 -> CSS colour on the red-amber-green ramp. Display colour only, not a safety class. */
export function rampColor(t) {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const [a, b, k] = u < 0.5 ? [RAMP[0], RAMP[1], u / 0.5] : [RAMP[1], RAMP[2], (u - 0.5) / 0.5];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
}
export const RAMP_CSS = `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})`;

/** Which badge a route gets (rule from Ramish): SAMPLE / stand-in planner / none. */
export function routeKind(route) {
  const p = route?.properties || {};
  if (/SAMPLE/.test(String(p.plan_id)) || /SAMPLE/.test(String(p.model_version))) return "sample";
  if (String(p.model_version || "").startsWith("standin-")) return "standin";
  return "planner";
}

/** Checks that a route can be drawn on this grid. Returns an error string or null. */
export function checkRoute(route, f) {
  if (route?.type !== "Feature" || route?.geometry?.type !== "LineString") return "route.json is not a GeoJSON LineString Feature";
  if (route.properties?.frame !== "jezero-local-v1") return `route.json frame is "${route.properties?.frame}", expected jezero-local-v1`;
  const n = route.geometry.coordinates.length;
  const pv = route.properties.per_vertex || {};
  for (const k of ["t_min", "margin_min", "slope_deg", "hazard"]) {
    if (!Array.isArray(pv[k]) || pv[k].length !== n) return `route.json per_vertex.${k} has ${pv[k]?.length ?? 0} values for ${n} points`;
  }
  const outside = route.geometry.coordinates.filter(([x, y]) => !f.inside(x, y)).length;
  if (outside) return `${outside} of ${n} route points fall outside this ${f.width} × ${f.height} grid — route and terrain are from different data sets`;
  return null;
}

/** Index of the route point closest to (x, y). Used only to place stops along the route. */
function nearestVertex(coords, x, y) {
  let best = 0, bestD = Infinity;
  coords.forEach(([cx, cy], i) => { const d = (cx - x) ** 2 + (cy - y) ** 2; if (d < bestD) { bestD = d; best = i; } });
  return best;
}

const argmax = (arr) => arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);

/**
 * Draws the route and returns helpers. Clicking the route calls onPoint(i) (moves the position arrow);
 * hovering calls onPreview(i) and leaving calls onPreviewEnd() (a ghost dot only; the arrow stays put).
 * stops: [{id, name, x, y, ...}] in local metres.
 */
export function drawRoute(map, f, route, { onPoint, onStop, onPreview = onPoint, onPreviewEnd = () => {} }) {
  const coords = route.geometry.coordinates;
  const pv = route.properties.per_vertex;
  const ll = coords.map(([x, y]) => f.localToLeaflet(x, y));
  const maxMargin = Math.max(...pv.margin_min);

  const group = L.layerGroup();
  L.polyline(ll, { color: "#0b0d10", weight: 9, opacity: 0.75, interactive: false }).addTo(group);
  for (let i = 0; i < ll.length - 1; i++) {
    const seg = L.polyline([ll[i], ll[i + 1]], {
      color: rampColor(maxMargin > 0 ? pv.margin_min[i] / maxMargin : 0), weight: 5, opacity: 1,
    });
    seg.on("mouseover", () => onPreview(i));
    seg.on("mouseout", () => onPreviewEnd());
    seg.on("click", () => onPoint(i));
    seg.addTo(group);
  }

  // Start point.
  L.circleMarker(ll[0], { radius: 7, color: "#fff", weight: 2, fillColor: "#2f6fed", fillOpacity: 1 })
    .bindTooltip("Start / return point").addTo(group);

  // Hazard markers: the single highest AI-hazard point and the steepest point, read from per_vertex.
  // A pin only means something if the values differ: an all-zero hazard (e.g. the stand-in planner, AI layer
  // not ready) would otherwise put a misleading "highest hazard" pin on the first point.
  const markers = [];
  if (Math.max(...pv.hazard) > 0) {
    markers.push({ i: argmax(pv.hazard), text: (i) => `Highest AI hazard estimate on route: ${pv.hazard[i]} (model, validated on held-out terrain)` });
  }
  if (Math.max(...pv.slope_deg) > 0) {
    markers.push({ i: argmax(pv.slope_deg), text: (i) => `Steepest point on route: ${pv.slope_deg[i]}°` });
  }
  for (const m of markers) {
    L.marker(ll[m.i], { icon: L.divIcon({ className: "hazard-pin", html: "!", iconSize: [20, 20] }), keyboard: false })
      .bindTooltip(m.text(m.i)).on("mouseover", () => onPreview(m.i)).on("mouseout", () => onPreviewEnd())
      .on("click", () => onPoint(m.i)).addTo(group);
  }

  // Stops, each tied to its nearest route point so the panel can say which one is next.
  const stops = (route.properties.stops || []).map((s) => ({ ...s, vertex: nearestVertex(coords, s.x, s.y) }));
  stops.sort((a, b) => a.vertex - b.vertex);
  const stopMarkers = {};
  for (const s of stops) {
    const m = L.marker(f.localToLeaflet(s.x, s.y), {
      icon: L.divIcon({ className: "stop-pin", html: s.id, iconSize: [30, 30] }),
    }).bindTooltip(s.name);
    m.on("click", () => onStop(s.id));
    stopMarkers[s.id] = m;
    m.addTo(group);
  }

  // "You are here" arrow that the slider / hover / Play moves along the route. It points along the route
  // (direction from this point to the next one; geometry only). Map is north-up: lat grows north, lng east.
  const here = L.marker(ll[0], {
    icon: L.divIcon({ className: "here-arrow", iconSize: [34, 34],
      html: '<svg viewBox="0 0 34 34" width="34" height="34"><circle cx="17" cy="17" r="15" fill="#111" stroke="#fff" stroke-width="2.5"/><path d="M17 6 L25 25 L17 20.5 L9 25 Z" fill="#fff"/></svg>' }),
    interactive: false, keyboard: false, zIndexOffset: 1000,
  });
  here.addTo(group);
  const headingDeg = (i) => {
    const a = ll[Math.min(i, ll.length - 2)], b = ll[Math.min(i + 1, ll.length - 1)];
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; // 0 = north, 90 = east
  };
  const turnArrow = (i) => {
    const svg = here.getElement()?.querySelector("svg");
    if (svg && ll.length > 1) svg.style.transform = `rotate(${headingDeg(i)}deg)`;
  };

  // Ghost dot for hover previews (the arrow = position only moves on click / slider / Play / keys).
  const ghost = L.circleMarker(ll[0], { radius: 7, color: "#fff", weight: 2, dashArray: "3 3", fillColor: "#fff", fillOpacity: 0.25, interactive: false });

  group.addTo(map);
  return {
    layer: group,
    stops,
    maxMargin,
    setPoint(i) { here.setLatLng(ll[i]); turnArrow(i); },
    setGhost(i) { ghost.setLatLng(ll[i]); if (!group.hasLayer(ghost)) ghost.addTo(group); },
    clearGhost() { ghost.remove(); },
    focusStop(id) { const m = stopMarkers[id]; if (m) map.panTo(m.getLatLng()); },
  };
}
