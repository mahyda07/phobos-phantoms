// Written with AI assistance (Claude).
// "Moving map" playback for the planned route: Play/Pause along the route, Follow (keep the current point centred),
// and distance rings around the current point. Map geometry and point-index stepping ONLY: walking time, margin,
// slope and hazard come from route.json per_vertex and are shown by panel.js renderReadout (via the caller's onIndex).
// Coordinates come from the caller (getPointLatLng, built on f.localToLeaflet); ring radii use f.cell only.
// Leaflet is passed in as opts.L (and the CSS is imported by main.js) so `node --test` can import this file.
//
// Ring radius units: in Leaflet 1.9.4 L.Circle._project (src/layer/vector/Circle.js, non-Earth branch, line 94):
//   var latlng2 = crs.unproject(crs.project(this._latlng).subtract([this._mRadius, 0]));
// i.e. for CRS.Simple the radius is subtracted directly in CRS units (1 unit = 1 grid cell = f.cell metres).

export const RING_STEP_M = 100;
export const RING_MAX_M = 500;
export const BASE_POINTS_PER_SECOND = 20;
export const SPEEDS = [1, 2, 4];

/** [step, 2*step, ...] up to and including maxMetres. Empty for non-positive / non-finite inputs. */
export function ringRadii(maxMetres, stepMetres) {
  if (!(stepMetres > 0) || !(maxMetres > 0) || !Number.isFinite(maxMetres) || !Number.isFinite(stepMetres)) return [];
  const out = [];
  const n = Math.floor(maxMetres / stepMetres + 1e-9);
  for (let k = 1; k <= n; k++) out.push(Math.round(k * stepMetres * 1e6) / 1e6);
  return out;
}

/** "100 m", "1 km", "1.5 km". */
export function ringLabel(m) {
  if (m >= 1000) return `${Number((m / 1000).toFixed(2))} km`;
  return `${Number(m.toFixed(1))} m`;
}

/** Next playback index: i + step, clamped to [0, n-1]. */
export function nextIndex(i, n, step = 1) {
  if (!(n > 0)) return 0;
  return Math.max(0, Math.min(n - 1, i + step));
}

/** Metres -> CRS.Simple map units (grid cells). */
export function metresToMapUnits(m, f) {
  return m / f.cell;
}

/**
 * Adds the moving-map control (top-left, under the existing controls).
 * opts: { L (the Leaflet module), getPointLatLng(i) -> [lat, lng], pointCount, onIndex(i) }.
 * Returns { setIndex(i), setPointCount(n), destroy() }.
 */
export function initMovingMap(map, f, { L, getPointLatLng, pointCount = 0, onIndex = () => {} } = {}) {
  if (!L) throw new TypeError("initMovingMap: pass the Leaflet module as opts.L");
  let n = pointCount;
  let index = 0;
  let timer = null;
  let speed = 1;
  let follow = false;
  let ringsOn = true;

  // --- rings -------------------------------------------------------------
  const radii = ringRadii(RING_MAX_M, RING_STEP_M);
  const ringLayer = L.layerGroup();
  const rings = radii.map((m) => L.circle([0, 0], {
    radius: metresToMapUnits(m, f), className: "mm-ring", color: "#fff", weight: 1, opacity: 0.35,
    dashArray: "4 4", fill: false, interactive: false,
  }).addTo(ringLayer));
  const labels = radii.map((m) => L.marker([0, 0], {
    icon: L.divIcon({ className: "mm-ring-label", html: ringLabel(m), iconSize: null }),
    interactive: false, keyboard: false,
  }).addTo(ringLayer));

  const pointAt = (i) => (n > 0 ? getPointLatLng(Math.max(0, Math.min(n - 1, i))) : null);
  function placeRings() {
    const p = pointAt(index);
    if (!p) { ringLayer.remove(); return; }
    rings.forEach((c) => c.setLatLng(p));
    // North side: lat grows northwards in CRS.Simple (f.localToLeaflet: lat = height + y/cell, y north-positive).
    labels.forEach((mk, k) => mk.setLatLng([p[0] + metresToMapUnits(radii[k], f), p[1]]));
    if (ringsOn && !map.hasLayer(ringLayer)) ringLayer.addTo(map);
    if (!ringsOn && map.hasLayer(ringLayer)) ringLayer.remove();
  }
  // Hide labels when rings are too close together on screen to read (CRS.Simple: 1 map unit = 2^zoom px).
  function updateLabelVisibility() {
    const spacingPx = metresToMapUnits(RING_STEP_M, f) * Math.pow(2, map.getZoom());
    map.getContainer().classList.toggle("mm-labels-hidden", spacingPx < 18);
  }
  function followPoint() {
    if (!follow) return;
    const p = pointAt(index);
    if (p) map.panTo(p, { animate: false });
  }

  // --- control DOM -------------------------------------------------------
  const root = L.DomUtil.create("div", "leaflet-control mm-control");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Route playback");
  L.DomEvent.disableClickPropagation(root);
  L.DomEvent.disableScrollPropagation(root);

  const btn = (cls, text, label) => {
    const b = L.DomUtil.create("button", "mm-btn " + cls, root);
    b.type = "button";
    b.textContent = text;
    b.setAttribute("aria-label", label);
    return b;
  };
  const playBtn = btn("mm-play", "▶ Play", "Play route");
  const speedSel = L.DomUtil.create("select", "mm-speed", root);
  speedSel.setAttribute("aria-label", "Playback speed");
  for (const s of SPEEDS) {
    const o = L.DomUtil.create("option", "", speedSel);
    o.value = String(s);
    o.textContent = `${s}×`;
  }
  const followBtn = btn("mm-follow", "Follow", "Follow current point");
  const ringsBtn = btn("mm-rings", "Rings", "Distance rings");

  const setPressed = (b, on) => { b.setAttribute("aria-pressed", String(on)); b.classList.toggle("active", on); };
  const syncButtons = () => {
    const playing = timer !== null;
    playBtn.textContent = playing ? "❚❚ Pause" : "▶ Play";
    playBtn.setAttribute("aria-label", playing ? "Pause route" : "Play route");
    setPressed(playBtn, playing);
    setPressed(followBtn, follow);
    setPressed(ringsBtn, ringsOn);
    playBtn.disabled = n < 2;
  };

  // --- playback ----------------------------------------------------------
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    syncButtons();
  }
  function tick() {
    const next = nextIndex(index, n, speed);
    if (next === index) { stop(); return; }
    index = next;
    onIndex(index);   // caller's showPoint -> slider, marker, readout; it calls setIndex back
    placeRings();
    followPoint();
    if (index >= n - 1) stop();
  }
  function play() {
    if (n < 2) return;
    if (index >= n - 1) { index = 0; onIndex(0); placeRings(); followPoint(); }
    timer = setInterval(tick, 1000 / BASE_POINTS_PER_SECOND);
    syncButtons();
  }

  const onPlay = () => (timer !== null ? stop() : play());
  const onSpeed = () => { speed = Number(speedSel.value) || 1; };
  const onFollow = () => { follow = !follow; syncButtons(); followPoint(); };
  const onRings = () => { ringsOn = !ringsOn; syncButtons(); placeRings(); };
  const onDragStart = () => { if (follow) { follow = false; syncButtons(); } }; // the user takes the map back

  L.DomEvent.on(playBtn, "click", onPlay);
  L.DomEvent.on(speedSel, "change", onSpeed);
  L.DomEvent.on(followBtn, "click", onFollow);
  L.DomEvent.on(ringsBtn, "click", onRings);
  map.on("dragstart", onDragStart);
  map.on("zoomend", updateLabelVisibility);

  const Ctl = L.Control.extend({ options: { position: "topleft" }, onAdd: () => root, onRemove: () => {} });
  const control = new Ctl().addTo(map);

  syncButtons();
  updateLabelVisibility();
  placeRings();

  return {
    setIndex(i) {
      if (!(n > 0)) return;
      index = Math.max(0, Math.min(n - 1, Math.round(Number(i)) || 0));
      placeRings();
      followPoint();
    },
    setPointCount(count) {
      stop();
      n = count > 0 ? count : 0;
      index = 0;
      syncButtons();
      placeRings();
    },
    destroy() {
      stop();
      map.off("dragstart", onDragStart);
      map.off("zoomend", updateLabelVisibility);
      map.getContainer().classList.remove("mm-labels-hidden");
      L.DomEvent.off(playBtn, "click", onPlay);
      L.DomEvent.off(speedSel, "change", onSpeed);
      L.DomEvent.off(followBtn, "click", onFollow);
      L.DomEvent.off(ringsBtn, "click", onRings);
      ringLayer.remove();
      control.remove();
    },
  };
}
