// Written with AI assistance (Claude).
// Phobos Phantoms — mixed-reality hologram of the Jezero walking area (task: headset hologram, track [P5]).
// Real NASA terrain on your desk in Quest 3 passthrough: hit-test placement, hands (move, two-hand scale),
// snap-rotate buttons, height exaggeration, photo/slope layer, route ribbon (planner route if present,
// otherwise Perseverance's real path as a labelled stand-in). No real-time shadows (PLAN.md D1).
// Step-in walk (D26): "Step in" turns the hologram into the real 1:1 terrain around you and walks the planned
// route; the visor (Kashif's design v1) shows margin, time out, slope, AI hazard, next stop and sun height.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeFrame } from "./frame.js";
import { heightSampler, marginColour, holoScale, rampRGB } from "./terrain.js";
import { stopVertexIndices, walkState, ltstAt, sunAt, visorFields } from "./walk.js";
import { drawVisor, VISOR_W, VISOR_H } from "./visor.js";
import { planHome, homeSummary, reversedWalkedPath } from "./home.js";
import { initKeys } from "./keys.js";
import { createAudio, calloutsFor, VOICE_LINES } from "./audio.js";
import { shouldBuzz, pulseAll, hapticsEnabled, setHapticsEnabled } from "./haptics.js";
import { makeButton, makePlate, makeRay, T as UI } from "./xrui.js";
import { roverTrack, roverAt, ghostLabel, nearestS, GHOST_SPEED_MPS, GHOST_WALK_MPS } from "./ghost.js";

const DATA = "./data/";
const SHOW_3D_UI = new URLSearchParams(location.search).has("ui3d");   // desktop preview of the in-headset panels
const HOLO_SIZE = 0.6;            // metres across on the desk (PLAN: 1:2500 for 1.5 km)
const EXAGS = [1, 2, 4];          // height exaggeration options; default x2
const PINCH_ON = 0.02, PINCH_OFF = 0.035;
const statusEl = document.getElementById("status");
const setStatus = (t) => { statusEl.textContent = t; };
const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent("phobos:" + name, { detail }));
// run 2 diagnostics (read by qa/scripts over CDP): ring buffer of events + per-second JS frame cost
const mwlog = (ev, d = {}) => { const L = (window.__mwlog ||= []); L.push({ t: Math.round(performance.now()), ev, ...d }); if (L.length > 300) L.shift(); };
window.__mwperf = { js: [], render: [] };


// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const desktopBg = new THREE.Color(0x0b0f14);
scene.background = desktopBg;
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 0.55, 0.75);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 0, 0);
orbit.update();
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.0));

// anchor = where the hologram sits (moved by hands / placement); model = rotation + scale; holo = terrain metres
const anchor = new THREE.Group();
const model = new THREE.Group();
const holo = new THREE.Group();
anchor.add(model); model.add(holo);
scene.add(anchor);

let F, grid, sampler, extentM, S, exagIdx = 1, layer = "photo";
let terrainMat, textures = {}, routeInfo = "", fps = 0;
let maxMarginRoute = 0;
let routeData = null, stopIdx = [], winData = null, holoTube = null, walkTube = null;

function applyScale(mult = model.userData.mult ?? 1) {
  model.userData.mult = mult;
  model.scale.set(S * mult, S * mult * EXAGS[exagIdx], S * mult);
  panel.position.set(0, 0.03, (HOLO_SIZE / 2) * mult + 0.07);
}

// ---------- data ----------
async function loadBin(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return new Float32Array(await r.arrayBuffer());
}
async function loadJSON(url) {   // null if missing (dev servers may answer a missing file with index.html)
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const text = await r.text();
    return text.trimStart().startsWith("<") ? null : JSON.parse(text);
  } catch { return null; }
}
const loadTex = (url) => new Promise((res) => new THREE.TextureLoader().load(url, (t) => {
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t);
}, undefined, () => res(null)));

async function init() {
  grid = await loadJSON(DATA + "grid.json");
  const meta = await loadJSON(DATA + "terrain.meta.json");
  if (!grid || !meta) throw new Error("grid.json / terrain.meta.json missing — run `npm run copy-data`");
  F = makeFrame(grid);
  extentM = grid.width * grid.cell_m;
  S = holoScale(HOLO_SIZE, extentM);
  const lodParam = new URLSearchParams(location.search).get("lod");
  const lod = meta.lod.find((l) => String(l.width) === lodParam) || meta.lod.find((l) => l.width === 512) || meta.lod[0];
  const n = lod.width;
  const heights = await loadBin(DATA + lod.file);
  sampler = heightSampler(heights, n, extentM);

  // terrain mesh: PlaneGeometry rotated -90° about X so row 0 (north) is at -Z
  const geo = new THREE.PlaneGeometry(extentM, extentM, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i] - F.zRef);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  textures.photo = await loadTex(DATA + "photo_2k.jpg") || await loadTex(DATA + "photo.png");
  textures.slope = await loadTex(DATA + "slope.png");
  terrainMat = new THREE.MeshBasicMaterial({ map: textures.photo, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, terrainMat);
  mesh.position.set(extentM / 2, 0, extentM / 2);   // holo space: x 0..extent, z 0..extent (= -y)
  holo.add(mesh);
  holo.position.set(-extentM / 2, 0, -extentM / 2); // centre the model on the anchor

  // thin base / skirt so it reads as an object on the table
  const base = new THREE.Mesh(new THREE.BoxGeometry(extentM, 1, extentM), new THREE.MeshBasicMaterial({ color: 0x2a1d16 }));
  base.position.set(extentM / 2, -2, extentM / 2);
  holo.add(base);

  await addRoute();
  await buildGhost();
  winData = await loadJSON(DATA + "window.json");
  applyScale(1);
  setStatus(info());
  enableButtons();
  const pr = routeData?.properties;
  emit("ready", { routeInfo, standin: String(pr?.plan_id || "").startsWith("standin-"),
    length_km: pr ? pr.length_m / 1000 : null, margin_min: pr?.margin_min ?? null, stops: pr?.stops?.length ?? 0,
    eva: winData?.eva_window ?? null });
}

// ---------- route ribbon ----------
function tubeFor(points, colours, radius) {
  const curve = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) curve.add(new THREE.LineCurve3(points[i - 1], points[i]));
  const seg = points.length - 1, radial = 5;
  const g = new THREE.TubeGeometry(curve, seg, radius, radial, false);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let s = 0; s <= seg; s++) {
    const c = colours[Math.min(s, colours.length - 1)];
    for (let k = 0; k <= radial; k++) col.set(c, (s * (radial + 1) + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
}
const toHolo = (x, y, lift = 4) => {
  const [tx, ty, tz] = F.localToThree(x, y, sampler(x, y));
  return new THREE.Vector3(tx, ty + lift, tz);
};
function thin(coords, minStep = 4) {   // drop points closer than minStep metres (keeps the mesh light)
  const out = [coords[0]];
  for (const c of coords.slice(1)) {
    const p = out[out.length - 1];
    if (Math.hypot(c[0] - p[0], c[1] - p[1]) >= minStep) out.push(c);
  }
  if (out.length === 1 && coords.length > 1) out.push(coords[coords.length - 1]);
  return out;
}

async function addRoute() {
  const route = await loadJSON(DATA + "route.json");
  if (route && route.geometry?.coordinates?.length > 1) {
    const pts = route.geometry.coordinates.map(([x, y]) => toHolo(x, y));
    const m = route.properties.per_vertex?.margin_min || [];
    const mMax = Math.max(...m.filter(Number.isFinite), 0);
    const col = (i) => (mMax > 0 ? rampRGB(m[i] / mMax) : marginColour(m[i]));   // same continuous ramp as the map
    holoTube = tubeFor(pts, pts.map((_, i) => col(i)), 3);
    holo.add(holoTube);
    // thin ribbon just above the ground for the 1:1 step-in walk (hidden on the desk)
    const wpts = route.geometry.coordinates.map(([x, y]) => toHolo(x, y, 0.4));
    walkTube = tubeFor(wpts, wpts.map((_, i) => col(i)), 0.25);
    walkTube.visible = false;
    holo.add(walkTube);
    routeData = route;
    maxMarginRoute = Math.max(...(route.properties.per_vertex?.margin_min || [0]).filter(Number.isFinite));
    stopIdx = stopVertexIndices(route.geometry.coordinates, route.properties.stops || []);
    for (const s of route.properties.stops || []) {
      const p = toHolo(s.x, s.y, 0);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 40, 8), new THREE.MeshBasicMaterial({ color: 0xff7a00 }));
      pin.position.set(p.x, p.y + 20, p.z);
      const head = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb000 }));
      head.position.set(p.x, p.y + 42, p.z);
      holo.add(pin, head);
    }
    const pr = route.properties;
    routeInfo = `route ${pr.plan_id}: ${(pr.length_m / 1000).toFixed(2)} km, margin ${pr.margin_min} min`;
    return;
  }
  const rover = await loadJSON(DATA + "rover_path.json");
  if (rover) {
    for (const f of rover.features) {
      const c = thin(f.geometry.coordinates);
      if (c.length < 2) continue;
      const pts = c.map(([x, y]) => toHolo(x, y));
      holo.add(tubeFor(pts, pts.map(() => [0.2, 0.85, 1.0]), 2.5));
    }
    routeInfo = `Perseverance real path (stand-in until planner route), ${(rover.total_length_m / 1000).toFixed(1)} km`;
  }
}

// ---------- 3D button panel (works with pinch, controller trigger, or mouse) ----------
const panel = new THREE.Group();
anchor.add(panel);
const buttons = [];
// run 2 MR UI overhaul: buttons from xrui.js (hover / press states, glass plate), laid out in two rows.
const BW = 0.13, BH = 0.05, GAP = 0.012;
function addButton(id, text, col, row, onPress, opts = {}, parent = deskRows) {
  const b = makeButton({ label: text, w: BW, h: BH, onPress, ...opts });
  b.position.set((col - 1) * (BW + GAP), -row * (BH + GAP), 0.002);
  b.userData.id = id;
  parent.add(b); buttons.push(b);
  return b;
}
const deskRows = new THREE.Group();          // tilted toward the user, sits in front of the hologram
deskRows.rotation.x = -0.6;
panel.add(deskRows);
const deskPlate = makePlate({ w: 3 * BW + 4 * GAP, h: 2 * BH + 3 * GAP + 0.012 });
deskPlate.position.set(0, -(BH + GAP) / 2, 0);
deskRows.add(deskPlate);
const act = {
  rotL: () => { model.rotation.y += THREE.MathUtils.degToRad(15); },
  rotR: () => { model.rotation.y -= THREE.MathUtils.degToRad(15); },
  exag: () => { exagIdx = (exagIdx + 1) % EXAGS.length; applyScale(); bExag.userData.setText(`Height ×${EXAGS[exagIdx]}`); document.getElementById("btn-exag").textContent = `Height ×${EXAGS[exagIdx]}`; },
  layer: () => {
    layer = layer === "photo" ? "slope" : "photo";
    terrainMat.map = textures[layer] || textures.photo; terrainMat.needsUpdate = true;
    bLayer.userData.setText(layer === "photo" ? "Layer: photo" : "Layer: slope");
    document.getElementById("btn-layer").textContent = `Layer: ${layer}`;
  },
  replace: () => { placed = false; anchor.visible = false; },
};
addButton("rotL", "Rotate left", 0, 0, act.rotL);
addButton("rotR", "Rotate right", 1, 0, act.rotR);
const bExag = addButton("exag", "Height ×2", 2, 0, act.exag);
const bLayer = addButton("layer", "Layer: photo", 0, 1, act.layer);
addButton("replace", "Re-place", 1, 1, act.replace);
addButton("stepin", "Step in", 2, 1, () => startWalk(), { kind: "primary", sub: "walk it at full size" });
const infoMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.05), new THREE.MeshBasicMaterial({ transparent: true }));
infoMesh.position.set(0, 0.085, -0.045); infoMesh.rotation.x = -0.6;
panel.add(infoMesh);
let lastInfo = "";
function drawInfo(text) {
  if (text === lastInfo) return; lastInfo = text;
  const c = document.createElement("canvas"); c.width = 1024; c.height = 128;
  const g = c.getContext("2d"); g.fillStyle = UI.panel; g.beginPath(); g.roundRect(2, 2, 1020, 124, 24); g.fill();
  g.fillStyle = UI.text; g.font = `500 28px ${UI.font}`; g.textBaseline = "middle";
  text.split("\n").slice(0, 2).forEach((line, i) => g.fillText(line, 16, 36 + i * 52));
  if (infoMesh.material.map) infoMesh.material.map.dispose();
  infoMesh.material.map = new THREE.CanvasTexture(c); infoMesh.material.map.colorSpace = THREE.SRGBColorSpace; infoMesh.material.needsUpdate = true;
}
const info = () => `Jezero western delta · 1.5 km · 1:${Math.round(1 / (S * (model.userData.mult ?? 1)))} · height ×${EXAGS[exagIdx]} · ${fps} fps\n${routeInfo}`;

// desktop: HTML buttons + mouse clicks on 3D buttons
document.getElementById("btn-rotl").onclick = act.rotL;
document.getElementById("btn-rotr").onclick = act.rotR;
document.getElementById("btn-exag").onclick = act.exag;
document.getElementById("btn-layer").onclick = act.layer;
const ray = new THREE.Raycaster();
renderer.domElement.addEventListener("click", (e) => {
  const v = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(v, camera);
  const hit = ray.intersectObjects(buttons.filter(shown), false)[0];
  if (hit) pressButton(hit.object, null);
});
let mouseHover = null;
renderer.domElement.addEventListener("pointermove", (e) => {
  if (renderer.xr.isPresenting) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const b = ray.intersectObjects(buttons.filter(shown), false)[0]?.object || null;
  if (b !== mouseHover) { if (mouseHover?.userData.state === "hover") mouseHover.userData.setState("normal"); if (b) b.userData.setState("hover"); mouseHover = b; }
  renderer.domElement.style.cursor = b ? "pointer" : "";
});

// ---------- XR sessions ----------
let hitSource = null, placed = true, sessionStart = 0;
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);

async function enterXR(mode) {
  const opts = mode === "immersive-ar"
    ? { requiredFeatures: ["hit-test"], optionalFeatures: ["local-floor", "hand-tracking"] }
    : { optionalFeatures: ["local-floor", "hand-tracking"] };
  const session = await navigator.xr.requestSession(mode, opts);
  window.__xrSession = session;                     // for qa/scripts/quest.py --xr-fps (read-only use)
  await renderer.xr.setSession(session);
  scene.background = mode === "immersive-ar" ? null : desktopBg;
  placed = false; anchor.visible = false; sessionStart = performance.now();
  emit("session", { mode }); showHint("place");
  if (mode === "immersive-ar") {
    const viewer = await session.requestReferenceSpace("viewer");
    hitSource = await session.requestHitTestSource({ space: viewer });
  }
  session.addEventListener("end", () => {
    if (walking) stopWalk();
    hitSource = null; scene.background = desktopBg; placed = true; anchor.visible = true;
    anchor.position.set(0, 0, 0); reticle.visible = false; hint.visible = false;
    emit("session-end");
  });
}
function enableButtons() {
  const ar = document.getElementById("btn-ar"), vr = document.getElementById("btn-vr");
  if (!navigator.xr) { setStatus(info() + "\n(WebXR not available here — desktop preview only)"); emit("xr", { ar: false, vr: false }); return; }
  Promise.all([navigator.xr.isSessionSupported("immersive-ar").catch(() => false), navigator.xr.isSessionSupported("immersive-vr").catch(() => false)])
    .then(([a, v]) => { ar.disabled = !a; vr.disabled = !v; emit("xr", { ar: a, vr: v }); });
  ar.onclick = () => enterXR("immersive-ar").catch((e) => setStatus("AR failed: " + e.message));
  vr.onclick = () => enterXR("immersive-vr").catch((e) => setStatus("VR failed: " + e.message));
}

function placeAt(pos) {   // put the hologram at pos, turned so the button panel faces the user
  const cam = renderer.xr.getCamera();
  anchor.position.copy(pos);
  anchor.rotation.set(0, Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z), 0);
  anchor.visible = true; placed = true; reticle.visible = false;
  showHint("explore");
}
function placeInFront() {
  const cam = renderer.xr.getCamera();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); dir.y = 0; dir.normalize();
  const p = cam.position.clone().addScaledVector(dir, 0.6); p.y = cam.position.y - 0.45;
  placeAt(p);
}

// controllers: trigger = place / press button
const tmpM = new THREE.Matrix4();
const ctrls = [];
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const { ray: line, cursor } = makeRay();
  ctrl.add(line); scene.add(cursor);
  const c = { ctrl, line, cursor, hover: null, src: null };
  ctrl.addEventListener("connected", (e) => { c.src = e.data; line.visible = !e.data.hand; });
  ctrl.addEventListener("disconnected", () => { c.src = null; line.visible = false; cursor.visible = false; });
  ctrl.addEventListener("select", () => {
    if (!placed) { if (reticle.visible) placeAt(new THREE.Vector3().setFromMatrixPosition(reticle.matrix)); else placeInFront(); return; }
    const hit = rayHit(ctrl);
    if (hit) pressButton(hit.object, c.src);
  });
  scene.add(ctrl);
  ctrls.push(c);
}
function rayHit(ctrl) {
  tmpM.identity().extractRotation(ctrl.matrixWorld);
  ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
  ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  return ray.intersectObjects(buttons.filter(shown), false)[0] || null;
}
function pressButton(b, src) {
  b.userData.setState("press");
  setTimeout(() => b.userData.setState(b === hovered() ? "hover" : "normal"), 140);
  const h = src?.gamepad?.hapticActuators?.[0]; h?.pulse?.(0.15, 18)?.catch?.(() => {});   // tiny tick confirms the press
  b.userData.onPress();
}
const hovered = () => ctrls.find((c) => c.hover)?.hover || null;
const tmpQ2 = new THREE.Quaternion();
function updatePointers() {                         // hover state + ray length + cursor ring, once per frame
  const was = new Set(ctrls.map((c) => c.hover).filter(Boolean));
  for (const c of ctrls) {
    c.hover = null;
    if (!c.src || c.src.hand || !c.line.visible) { c.cursor.visible = false; continue; }
    const hit = rayHit(c.ctrl);
    if (hit) {
      c.hover = hit.object; c.line.scale.z = hit.distance;
      c.cursor.visible = true; c.cursor.position.copy(hit.point);
      c.cursor.quaternion.copy(hit.object.getWorldQuaternion(tmpQ2));
    } else { c.line.scale.z = 2; c.cursor.visible = false; }
  }
  const now = new Set(ctrls.map((c) => c.hover).filter(Boolean));
  for (const b of was) if (!now.has(b) && b.userData.state !== "press") b.userData.setState("normal");
  for (const b of now) if (b.userData.state === "normal") b.userData.setState("hover");
}

// hands: pinch to place, press buttons, grab-move (one hand) and scale (two hands)
const handFactory = new XRHandModelFactory();
const hands = [0, 1].map((i) => {
  const h = renderer.xr.getHand(i);
  h.add(handFactory.createHandModel(h, "spheres"));
  scene.add(h);
  return { h, pinching: false, grabbing: false, pos: new THREE.Vector3(), last: new THREE.Vector3() };
});
let two = null;
const box = new THREE.Box3();
function nearButton(p) {
  let best = null, bd = 0.04;
  for (const b of buttons) {
    if (!shown(b)) continue;
    const d = b.getWorldPosition(new THREE.Vector3()).distanceTo(p); if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function updateHands() {
  for (const s of hands) {
    const t = s.h.joints?.["thumb-tip"], ix = s.h.joints?.["index-finger-tip"];
    if (!t || !ix || !t.visible) { s.pinching = s.grabbing = false; continue; }
    const d = t.position.distanceTo(ix.position);
    s.last.copy(s.pos);
    s.pos.copy(t.position).add(ix.position).multiplyScalar(0.5);
    const was = s.pinching;
    s.pinching = was ? d < PINCH_OFF : d < PINCH_ON;
    if (s.pinching && !was) {                       // pinch started
      if (!placed) { if (reticle.visible) placeAt(new THREE.Vector3().setFromMatrixPosition(reticle.matrix)); else placeInFront(); continue; }
      const b = nearButton(s.pos);
      if (b) { pressButton(b, null); continue; }
      if (walking) continue;
      box.setFromObject(model).expandByScalar(0.08);
      s.grabbing = box.containsPoint(s.pos);
      s.last.copy(s.pos);
    }
    if (!s.pinching) s.grabbing = false;
  }
  const g = hands.filter((s) => s.grabbing);
  if (g.length === 2) {
    const dist = g[0].pos.distanceTo(g[1].pos);
    if (!two) two = { d0: dist, m0: model.userData.mult ?? 1 };
    applyScale(THREE.MathUtils.clamp(two.m0 * dist / Math.max(two.d0, 1e-3), 0.25, 4));
  } else {
    two = null;
    if (g.length === 1) anchor.position.add(new THREE.Vector3().subVectors(g[0].pos, g[0].last));
  }
}

// ---------- step-in walk + visor (D26) ----------
function shown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

const SPEEDS = [10, 30, 60];      // simulated walking minutes per real minute
const EYE = 1.7;                  // metres: desktop eye height above the ground
let walking = false, playing = true, simT = 0, speedIdx = 1, lastNow = 0;
let walkYaw = 0, walkSaved = null, lastVisorKey = "";
const walkOrigin = new THREE.Vector3();

// sky dome + haze so the walk reads as Mars (also hides passthrough while stepped in)
const sky = (() => {
  const g = new THREE.SphereGeometry(4000, 32, 16);
  const col = new Float32Array(g.attributes.position.count * 3);
  const top = new THREE.Color(0xd9b48f), hor = new THREE.Color(0xc79a74), low = new THREE.Color(0x5a3d2b);
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i) / 4000;
    const c = y >= 0 ? hor.clone().lerp(top, Math.min(1, y * 2)) : hor.clone().lerp(low, Math.min(1, -y * 4));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.visible = false; m.renderOrder = -1;
  scene.add(m);
  return m;
})();
const haze = new THREE.Fog(0xc79a74, 500, 3000);

// visor: a canvas on a plane that follows the head (centre band left clear)
const visorCanvas = document.createElement("canvas");
visorCanvas.width = VISOR_W; visorCanvas.height = VISOR_H;
const visorTex = new THREE.CanvasTexture(visorCanvas); visorTex.colorSpace = THREE.SRGBColorSpace;
const visor = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0 * VISOR_H / VISOR_W),
  new THREE.MeshBasicMaterial({ map: visorTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
visor.renderOrder = 10; visor.visible = false;
scene.add(visor);

// walk controls: a small panel at waist height in front of you (follows where you face, not your head tilt)
const walkPanel = new THREE.Group();
walkPanel.visible = false;
scene.add(walkPanel);
const walkRows = new THREE.Group(); walkRows.rotation.x = -0.5; walkPanel.add(walkRows);
const walkPlate = makePlate({ w: 3 * BW + 4 * GAP, h: 2 * BH + 3 * GAP + 0.03, title: "Walk" });
walkPlate.position.set(0, -(BH + GAP) / 2 + 0.012, 0); walkRows.add(walkPlate);
const addWalkButton = (text, col, row, onPress, opts) => addButton("walk-" + text, text, col, row, onPress, opts, walkRows);
const bPlay = addWalkButton("Pause", 0, 0, () => togglePause());
const bSpeed = addWalkButton(`Speed ${SPEEDS[1]}×`, 1, 0, () => {
  speedIdx = (speedIdx + 1) % SPEEDS.length; bSpeed.userData.setText(`Speed ${SPEEDS[speedIdx]}×`);
});
addWalkButton("Restart", 2, 0, () => { clearHome(); simT = 0; playing = true; bPlay.userData.setText("Pause"); });
// haptic hazard on/off (remembered); only meaningful with controllers
let buzzOn = hapticsEnabled(), lastBuzz = 0;
const bBuzz = addWalkButton("Buzz", 0, 1, () => { buzzOn = !buzzOn; setHapticsEnabled(buzzOn); bBuzz.userData.setOn(buzzOn); }, { toggle: buzzOn, sub: "rough ground" });
addWalkButton("Get me home", 1, 1, () => goHome(), { kind: "home", sub: "or hold A" });
addWalkButton("Step out", 2, 1, () => stopWalk());

function viewPose() {   // world position + quaternion of the eyes (headset or desktop camera)
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  cam.getWorldPosition(pos); cam.getWorldQuaternion(quat);
  return { pos, quat };
}

function startWalk() {
  if (!routeData) { setStatus(info() + "\nNo planned route to walk yet."); return; }
  walkSaved = {
    anchorPos: anchor.position.clone(), anchorRot: anchor.rotation.clone(), modelRot: model.rotation.clone(),
    mult: model.userData.mult ?? 1, camPos: camera.position.clone(), far: camera.far, near: camera.near,
  };
  walking = true; playing = true; simT = 0; lastNow = performance.now();
  calloutPrev = null; audio.play("walk", { force: true });
  bPlay.userData.setText("Pause");
  panel.visible = false; holoTube && (holoTube.visible = false); walkTube && (walkTube.visible = true);
  sky.visible = true; scene.fog = haze; visor.visible = true; walkPanel.visible = true; reticle.visible = false;
  camera.near = 0.05; camera.far = 6000; camera.updateProjectionMatrix();
  model.scale.set(1, 1, 1);                       // real size, real height
  anchor.rotation.set(0, 0, 0); anchor.visible = true;

  if (!renderer.xr.isPresenting) {                 // desktop preview: put the camera at eye height, look around with the mouse
    camera.position.set(0, EYE, 0);
    orbit.target.set(0, EYE, -0.05); orbit.enableZoom = false; orbit.enablePan = false; orbit.update();
    walkOrigin.set(0, 0, 0);
  } else {
    const { pos } = viewPose();
    walkOrigin.set(pos.x, 0, pos.z);               // local-floor: the floor is y = 0
  }
  // turn the terrain so the first walking direction is straight ahead of you
  const st = walkState(routeData, 0, stopIdx);
  const v = new THREE.Vector3(Math.sin(st.heading), 0, -Math.cos(st.heading));
  const { quat } = viewPose();
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(quat); f.y = 0; f.normalize();
  walkYaw = Math.atan2(f.x, f.z) - Math.atan2(v.x, v.z);
  model.rotation.set(0, walkYaw, 0);
  updateWalk(performance.now());
  emit("walk", { on: true });
  if (renderer.xr.isPresenting) showHint("walk", 8000);
}

function stopWalk() {
  walking = false;
  clearHome();
  sky.visible = false; scene.fog = null; visor.visible = false; walkPanel.visible = false;
  panel.visible = true; holoTube && (holoTube.visible = true); walkTube && (walkTube.visible = false);
  if (walkSaved) {
    anchor.position.copy(walkSaved.anchorPos); anchor.rotation.copy(walkSaved.anchorRot);
    model.rotation.copy(walkSaved.modelRot);
    camera.near = walkSaved.near; camera.far = walkSaved.far; camera.updateProjectionMatrix();
    if (!renderer.xr.isPresenting) { camera.position.copy(walkSaved.camPos); orbit.target.set(0, 0, 0); orbit.enableZoom = true; orbit.enablePan = true; orbit.update(); }
    applyScale(walkSaved.mult);
  }
  lastVisorKey = "";
  emit("walk", { on: false });
}

const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
let walkNow = null;
function updateWalk(now) {
  const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  const tEnd = routeData.properties.per_vertex.t_min.at(-1);
  if (playing) simT = Math.min(tEnd, simT + dt * SPEEDS[speedIdx] / 60);   // real seconds x speed = simulated seconds; /60 -> minutes
  const st = walkState(routeData, simT, stopIdx);
  walkNow = st;
  if (st.done && playing) { playing = false; bPlay.userData.setText("Play"); }

  // move the world so the walker's point on the route is under your feet
  const [hx, hy, hz] = F.localToThree(st.x, st.y, sampler(st.x, st.y));
  tmpV.set(hx + holo.position.x, hy + holo.position.y, hz + holo.position.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), walkYaw);
  anchor.position.copy(walkOrigin).sub(tmpV);

  // visor follows the head (smoothed), walk panel follows where you face at waist height
  const { pos, quat } = viewPose();
  tmpQ.copy(quat);
  visor.quaternion.slerp(tmpQ, visor.userData.init ? 0.25 : 1);
  visor.position.copy(pos).add(new THREE.Vector3(0, 0, -0.9).applyQuaternion(visor.quaternion));
  visor.userData.init = true;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat); fwd.y = 0; fwd.normalize();
  const yaw = Math.atan2(-fwd.x, -fwd.z);
  walkPanel.position.lerp(pos.clone().addScaledVector(fwd, 0.42).add(new THREE.Vector3(0, -0.38, 0)), walkPanel.userData.init ? 0.1 : 1);
  walkPanel.rotation.set(0, yaw, 0);
  walkPanel.userData.init = true;

  // redraw the visor only when a shown value changes
  const sun = sunAt(winData, ltstAt(winData, st.t_min));
  const f = visorFields(st, sun, String(routeData.properties.plan_id || "").startsWith("standin-"));
  f.home = homeLine;
  f.marginT = maxMarginRoute > 0 && Number.isFinite(st.margin_min) ? st.margin_min / maxMarginRoute : null;   // same scale as the map
  if (caption && performance.now() < caption.until) f.caption = caption.text;
  if (playing) walkCallouts(st);
  if (playing && renderer.xr.isPresenting && shouldBuzz(st, now, lastBuzz, buzzOn)) { lastBuzz = now; pulseAll(renderer.xr.getSession()); }
  const key = JSON.stringify(f);
  if (key !== lastVisorKey) { drawVisor(visorCanvas.getContext("2d"), f); visorTex.needsUpdate = true; lastVisorKey = key; }
}
const walkInfo = () => walkNow
  ? `Step-in walk · ${SPEEDS[speedIdx]}× · ${playing ? "walking" : "paused"} · t ${walkNow.t_min.toFixed(1)} min · point ${walkNow.i + 1}/${routeData.geometry.coordinates.length} · ${fps} fps\n${routeInfo}${homeStatus ? "\n" + homeStatus : ""}`
  : info();

// ---------- run 2: voice mission control (Phase 2b; clips + rate limits in audio.js) ----------
const audio = createAudio();
const CAPTION = { steep: "Steep ground ahead", hazard: "AI hazard ahead", stop: "Stop reached", margin: "Margin under one hour",
  home: "Return route ready", "home-offline": "Planner offline: walked path reversed", waking: "Waking the planner", walk: "Walk started" };
let calloutPrev = null, caption = null;
audio.on((e) => {
  mwlog("audio", { type: e.type, name: e.name ?? null, muted: e.muted ?? audio.muted, ctx: audio.ctx?.state ?? "none" });
  if (e.type === "line") { caption = { text: CAPTION[e.name] || e.name, until: performance.now() + 4000 }; lastVisorKey = ""; emit("callout", { text: caption.text }); }
  if (e.type === "mute") emit("mute", { muted: e.muted });
});
function walkCallouts(st) {
  if (calloutPrev && calloutPrev.i === st.i) return;
  const lines = calloutsFor(routeData, st.i, calloutPrev, stopIdx);
  calloutPrev = { i: st.i, margin: st.margin_min };
  for (const l of lines) if (audio.say(l)) break;     // say() is rate-limited: first allowed line only
}

// ---------- run 2: "Get me home" (Phase 2a) ----------
// One action (controller A held 1 s · key H · walk-panel "Home") asks the live planner for a route from the walker's
// spot back to the walk's start. Numbers on the visor come from the planner response (home.js homeSummary).
const HOME_COLOUR = 0x7cc4ff;                       // docs/DESIGN_DIRECTION.md: home route
const reduceMotion = () => matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let homeTube = null, homeLine = null, homeBusy = false, homeDraw = null, homeStatus = "";
function setHome(lines) { homeLine = lines; lastVisorKey = ""; }
function clearHome() {
  if (homeTube) { holo.remove(homeTube); homeTube.geometry.dispose(); homeTube.material.dispose(); homeTube = null; }
  homeLine = null; homeDraw = null; homeStatus = ""; lastVisorKey = "";
}
function drawHome(coords) {
  clearHome();
  const pts = thin(coords, 2).map(([x, y]) => toHolo(x, y, 0.6));
  if (pts.length < 2) return;
  homeTube = tubeFor(pts, pts.map(() => new THREE.Color(HOME_COLOUR).toArray()), 0.35);
  homeTube.material.fog = false;
  const total = homeTube.geometry.index.count;
  if (reduceMotion()) homeTube.geometry.setDrawRange(0, total);
  else { homeTube.geometry.setDrawRange(0, 0); homeDraw = { t0: performance.now(), total }; }
  holo.add(homeTube);
}
function updateHomeDraw(now) {
  if (!homeDraw || !homeTube) return;
  const k = Math.min(1, (now - homeDraw.t0) / 600);   // 0.6 s draw-in
  const eased = 1 - Math.pow(1 - k, 3);
  homeTube.geometry.setDrawRange(0, Math.floor(homeDraw.total * eased / 6) * 6);
  if (k >= 1) homeDraw = null;
}
async function goHome() {
  mwlog("goHome", { walking, busy: homeBusy });
  if (!routeData) return;
  if (!walking) { emit("home", { state: "not-walking" }); setStatus(info() + "\nStep in first: Get me home plans from your spot on the walk back to its start."); return; }
  if (homeBusy) return;
  homeBusy = true;
  playing = false; bPlay.userData.setText("Play");
  const c = routeData.geometry.coordinates, st = walkNow, pos = [st.x, st.y];
  setHome(["Return route", "planning…"]); emit("home", { state: "planning" });
  const out = await planHome(c, st.i, pos, {
    onStatus: (s) => {
      if (s === "waking") { setHome(["Return route", "waking planner… (up to 1 min)"]); emit("home", { state: "waking" }); audio.play("waking", { force: true }); }
      if (s === "snapping") setHome(["Return route", "steep ground here: trying the route behind you"]);
    },
  });
  homeBusy = false;
  mwlog("home-result", { route: !!out.route, reason: out.reason ?? null, error: out.error ?? null, tries: out.tries ?? null });
  if (!walking) return;                              // stepped out while waiting
  if (out.route) {
    const sm = homeSummary(out.route);
    drawHome(out.route.geometry.coordinates);
    const snap = out.req.snapped_m >= 1 ? ` (start snapped ${Math.round(out.req.snapped_m)} m back to the planned route)` : "";
    setHome(["Return route", `${Math.round(sm.length_m)} m · ~${Math.round(sm.time_min)} min · margin ${Math.floor(sm.margin_min)} min`]);
    homeStatus = sm.text + snap; setStatus(walkInfo()); audio.play("home", { force: true });
    emit("home", { state: "ready", text: sm.text + snap, length_m: sm.length_m, time_min: sm.time_min, margin_min: sm.margin_min });
  } else {
    const fb = reversedWalkedPath(routeData, st.i, pos);
    drawHome(fb.coords);
    setHome([out.reason === "at-start" ? "Walked path reversed" : "Offline: walked path reversed", `${Math.round(fb.length_m)} m · ~${Math.round(fb.time_min)} min`]);
    homeStatus = fb.text; setStatus(walkInfo()); audio.play("home-offline", { force: true });
    emit("home", { state: "fallback", reason: out.reason, text: fb.text });
  }
}

// controller A (right hand, gamepad buttons[4]) held 1 s = Get me home
let aHeldSince = 0, aFired = false;
const padPrev = {};
function pollGamepads(now) {
  const session = renderer.xr.getSession?.();
  if (!session) return;
  let aDown = false;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const hand = src.handedness;
    gp.buttons.forEach((bt, idx) => { const k = "raw" + hand + idx; if (bt.pressed !== !!padPrev[k]) { padPrev[k] = bt.pressed; mwlog("btn", { hand, idx, down: bt.pressed }); } });
    if (hand === "right" && gp.buttons[4]?.pressed) aDown = true;
    // edge-triggered buttons (xr-standard mapping: 4 = A/X, 5 = B/Y; axes[3] = thumbstick y)
    const edge = (idx, fn) => { const k = hand + idx, on = !!gp.buttons[idx]?.pressed; if (on && !padPrev[k]) fn(); padPrev[k] = on; };
    if (hand === "right") edge(5, () => toggleGhost());
    if (hand === "left") { edge(4, () => toggleMute()); edge(5, () => repeatCallout()); }
    if (hand === "right" && walking) {
      const y = gp.axes[3] ?? 0, k = "stick";
      const dir = y < -0.7 ? 1 : y > 0.7 ? -1 : 0;
      if (dir && padPrev[k] !== dir) scrub(dir * 0.5);
      padPrev[k] = dir;
    }
  }
  if (aDown) {
    if (!aHeldSince) { aHeldSince = now; aFired = false; }
    else if (!aFired && now - aHeldSince >= 1000) { aFired = true; mwlog("a-hold"); goHome(); }
  } else aHeldSince = 0;
}

// desktop: HTML Step in / Step out
document.getElementById("btn-walk").onclick = () => (walking ? stopWalk() : startWalk());

// ---------- in-headset guidance (a small card that floats below your line of sight) ----------
const hintCanvas = document.createElement("canvas"); hintCanvas.width = 1024; hintCanvas.height = 256;
const hintTex = new THREE.CanvasTexture(hintCanvas); hintTex.colorSpace = THREE.SRGBColorSpace;
const hint = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09),
  new THREE.MeshBasicMaterial({ map: hintTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
hint.renderOrder = 11; hint.visible = false; scene.add(hint);
const HINTS = {
  place: ["Step 1 of 3: Place", "Look at a table until a white ring appears, then pull the trigger (or pinch)."],
  explore: ["Step 2 of 3: Explore", "Pinch and drag to move, two hands to scale. Point at the panel to rotate, change height or layer."],
  walk: ["Step 3 of 3: Walk", "You are on Mars at full size. The visor shows your margin. Hold A to plan a way home."],
};
let hintUntil = 0;
function showHint(key, ms = 9000) {
  const [title, body] = HINTS[key]; const g = hintCanvas.getContext("2d");
  g.clearRect(0, 0, 1024, 256);
  g.fillStyle = UI.panel; g.strokeStyle = UI.line; g.lineWidth = 3;
  g.beginPath(); g.roundRect(6, 6, 1012, 244, 32); g.fill(); g.stroke();
  const step = ["place", "explore", "walk"].indexOf(key);           // progress dots
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(944 + k * 26, 58, 8, 0, Math.PI * 2); g.fillStyle = k <= step ? UI.mars : "rgba(255,255,255,0.2)"; g.fill(); }
  g.fillStyle = UI.mars2; g.font = `700 40px ${UI.font}`; g.fillText(title, 40, 70);
  g.fillStyle = UI.text; g.font = `400 34px ${UI.font}`;
  const words = body.split(" "); let line = "", y = 135;
  for (const w of words) { if (g.measureText(line + w).width > 940) { g.fillText(line, 40, y); line = ""; y += 48; } line += w + " "; }
  g.fillText(line, 40, y);
  hintTex.needsUpdate = true; hint.visible = renderer.xr.isPresenting; hint.userData.init = false;
  hintUntil = key === "place" ? Infinity : performance.now() + ms;
}
function updateHint(now) {
  if (!hint.visible) return;
  if (now > hintUntil || (placed && hintUntil === Infinity)) { hint.visible = false; return; }
  const cam = renderer.xr.getCamera(); const pos = new THREE.Vector3(), q = new THREE.Quaternion();
  cam.getWorldPosition(pos); cam.getWorldQuaternion(q);
  hint.quaternion.slerp(q, hint.userData.init ? 0.08 : 1);
  hint.position.copy(pos).add(new THREE.Vector3(0, -0.16, -0.7).applyQuaternion(hint.quaternion));
  hint.userData.init = true;
}

// ---------- loop ----------
let frames = 0, t0 = performance.now();
let perfAcc = { js: 0, jsMax: 0, r: 0, rMax: 0, n: 0, t: performance.now() };
renderer.setAnimationLoop((time, frame) => {
  frames++;
  const now = performance.now();
  const tJs0 = now;
  if (now - t0 > 1000) { fps = Math.round(frames * 1000 / (now - t0)); frames = 0; t0 = now; drawInfo(info()); setStatus(walking ? walkInfo() : info()); }
  if (frame && renderer.xr.isPresenting) {
    if (!placed && hitSource) {
      const hits = frame.getHitTestResults(hitSource);
      if (hits.length) {
        const pose = hits[0].getPose(renderer.xr.getReferenceSpace());
        reticle.visible = true; reticle.matrix.fromArray(pose.transform.matrix);
      } else reticle.visible = false;
      if (!reticle.visible && now - sessionStart > 5000) placeInFront();   // fallback: 0.6 m in front
    } else if (!placed && !hitSource) placeInFront();
    updateHands();
    updateHint(now);
    pollGamepads(now);
    updatePointers();
  } else orbit.update();
  if (walking) updateWalk(now);
  updateHomeDraw(now);
  updateGhost(now);
  panel.visible = (renderer.xr.isPresenting || SHOW_3D_UI) && !walking;   // in-world panel is for the headset (?ui3d shows it on desktop)
  const tR0 = performance.now();
  renderer.render(scene, camera);
  const tEnd = performance.now(), js = tR0 - tJs0, r = tEnd - tR0;
  perfAcc.js += js; perfAcc.r += r; perfAcc.n++; perfAcc.jsMax = Math.max(perfAcc.jsMax, js); perfAcc.rMax = Math.max(perfAcc.rMax, r);
  if (tEnd - perfAcc.t > 1000) {
    const P = window.__mwperf; P.js.push([+(perfAcc.js / perfAcc.n).toFixed(2), +perfAcc.jsMax.toFixed(1)]); P.render.push([+(perfAcc.r / perfAcc.n).toFixed(2), +perfAcc.rMax.toFixed(1), renderer.info.render.calls, renderer.info.render.triangles]);
    if (P.js.length > 120) { P.js.shift(); P.render.shift(); }
    perfAcc = { js: 0, jsMax: 0, r: 0, rMax: 0, n: 0, t: tEnd };
  }
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- run 2: keyboard map for the desktop preview (Phase 2e; bindings + help overlay in keys.js) ----------
function scrub(dMin) {                               // move along the walk by simulated minutes
  if (!walking || !routeData) return;
  const tEnd = routeData.properties.per_vertex.t_min.at(-1);
  simT = Math.max(0, Math.min(tEnd, simT + dMin));
}
function turnView(deg) {                             // desktop preview only; in the headset you turn your head
  if (renderer.xr.isPresenting) return;
  if (!walking) { (deg > 0 ? act.rotL : act.rotR)(); return; }
  const off = orbit.target.clone().sub(camera.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg));
  orbit.target.copy(camera.position).add(off); orbit.update();
}
function zoomView(f) {
  if (renderer.xr.isPresenting || walking) return;
  camera.position.sub(orbit.target).multiplyScalar(f).add(orbit.target); orbit.update();
}
function togglePause() { if (!walking) return; playing = !playing; bPlay.userData.setText(playing ? "Pause" : "Play"); }
// ---------- run 2: ghost rover (Phase 2d; track helpers in ghost.js) ----------
const GHOST_COLOUR = 0xe6e8eb;                       // docs/DESIGN_DIRECTION.md: ghost rover, 50 % opacity
const ghost = { root: new THREE.Group(), trailDesk: null, trailWalk: null, marker: null, label: null, track: null, s: 0, text: null, last: 0 };
ghost.root.visible = false;
holo.add(ghost.root);
function mergedTrail(feats, lift, radius) {
  const geos = [];
  for (const f of feats) {
    const c = thin(f.geometry.coordinates, 4);
    if (c.length < 2) continue;
    const curve = new THREE.CurvePath();
    const pts = c.map(([x, y]) => toHolo(x, y, lift));
    for (let i = 1; i < pts.length; i++) curve.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    geos.push(new THREE.TubeGeometry(curve, pts.length - 1, radius, 4, false));
  }
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: GHOST_COLOUR, transparent: true, opacity: 0.3, depthWrite: false, fog: false }));
  geos.forEach((g) => g.dispose());
  return m;
}
function roverModel() {                              // simple low-poly shape (no copyrighted model): body, 6 wheels, mast
  const mat = new THREE.MeshBasicMaterial({ color: GHOST_COLOUR, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.9, 3.0), mat); body.position.y = 1.1; g.add(body);
  const wheel = new THREE.CylinderGeometry(0.26, 0.26, 0.4, 10).rotateZ(Math.PI / 2);
  for (const x of [-1.35, 1.35]) for (const z of [-1.1, 0, 1.1]) { const w = new THREE.Mesh(wheel, mat); w.position.set(x, 0.26, z); g.add(w); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), mat); mast.position.set(0.9, 2.15, -1.1); g.add(mast);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.3), mat); head.position.set(0.9, 2.85, -1.1); g.add(head);
  return g;
}
function labelSprite(title, note) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 160;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(12,17,26,0.82)"; g.beginPath(); g.roundRect(4, 4, 1016, 152, 24); g.fill();
  g.strokeStyle = "#e6e8eb"; g.lineWidth = 3; g.stroke();
  g.fillStyle = "#eef2f6"; g.font = "700 46px system-ui, sans-serif"; g.fillText(title, 32, 66, 960);
  g.fillStyle = "#9aa8b6"; g.font = "30px system-ui, sans-serif"; g.fillText(note, 32, 120, 960);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, fog: false }));
  sp.renderOrder = 5; sp.userData.aspect = 1024 / 160;
  return sp;
}
async function buildGhost() {
  const rover = await loadJSON(DATA + "rover_path.json");
  if (!rover?.features?.length) return;
  ghost.track = roverTrack(rover);
  ghost.text = ghostLabel(rover);
  ghost.trailDesk = mergedTrail(rover.features, 3, 4.0);
  ghost.trailWalk = mergedTrail(rover.features, 0.3, 0.15);
  if (ghost.trailDesk) ghost.root.add(ghost.trailDesk);
  if (ghost.trailWalk) { ghost.trailWalk.visible = false; ghost.root.add(ghost.trailWalk); }
  ghost.marker = roverModel(); ghost.root.add(ghost.marker);
  ghost.label = labelSprite(ghost.text.title, ghost.text.note); ghost.root.add(ghost.label);
}
function updateGhost(now) {
  if (!ghost.root.visible || !ghost.track) { ghost.last = now; return; }
  const dt = Math.min(0.1, (now - (ghost.last || now)) / 1000); ghost.last = now;
  ghost.s += dt * (walking ? GHOST_WALK_MPS : GHOST_SPEED_MPS);
  const p = roverAt(ghost.track, ghost.s);
  const at = toHolo(p.x, p.y, 0);
  ghost.marker.position.copy(at); ghost.marker.rotation.y = -p.heading;
  const k = walking ? 1 : 25;                          // real size on foot; enlarged on the desk so it can be seen
  ghost.marker.scale.setScalar(k);
  const w = walking ? 6 : 420;
  ghost.label.scale.set(w, w / ghost.label.userData.aspect, 1);
  ghost.label.position.set(at.x, at.y + (walking ? 5 : 170), at.z);
  if (ghost.trailDesk) ghost.trailDesk.visible = !walking;
  if (ghost.trailWalk) ghost.trailWalk.visible = walking;
}
function toggleGhost() {
  if (!ghost.track) { emit("ghost", { on: false, missing: true }); return; }
  ghost.root.visible = !ghost.root.visible;
  if (ghost.root.visible && walking && walkNow) ghost.s = nearestS(ghost.track, walkNow.x, walkNow.y).s;   // start near you
  { const wp = new THREE.Vector3(); ghost.marker?.getWorldPosition(wp); const { pos } = viewPose();
    mwlog("ghost", { on: ghost.root.visible, walking, dist_m: +wp.distanceTo(pos).toFixed(2), markerWorldScale: +ghost.marker?.getWorldScale(new THREE.Vector3()).x.toFixed(4) }); }
  emit("ghost", { on: ghost.root.visible, title: ghost.text.title, note: ghost.text.note });
}
function toggleMute() { audio.toggleMute(); }
function repeatCallout() { audio.repeat(); }
initKeys({
  forward: () => (walking ? scrub(0.5) : zoomView(0.9)), back: () => (walking ? scrub(-0.5) : zoomView(1.1)),
  left: () => turnView(15), right: () => turnView(-15), pause: togglePause,
  home: () => goHome(), ghost: () => toggleGhost(), mute: () => toggleMute(), repeat: () => repeatCallout(),
});

// Spoken commands: only where the browser has speech recognition (desktop Chrome; NOT Quest Browser 157).
// No mic button is shown where it cannot work.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const b = document.createElement("button");
  b.id = "btn-voice"; b.className = "tool"; b.textContent = "Voice"; b.title = "Say: home, ghost, mute, pause, help";
  document.getElementById("btn-help").before(b);
  b.onclick = () => {
    const rec = new SR(); rec.lang = "en-US"; rec.maxAlternatives = 3;
    b.textContent = "Listening…"; b.setAttribute("aria-pressed", "true");
    rec.onresult = (e) => {
      const said = Array.from(e.results[0]).map((a) => a.transcript.toLowerCase()).join(" ");
      if (/home/.test(said)) goHome(); else if (/ghost|rover/.test(said)) toggleGhost();
      else if (/mute|quiet|sound/.test(said)) toggleMute(); else if (/pause|stop|play/.test(said)) togglePause();
      else if (/help/.test(said)) document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
      emit("heard", { said });
    };
    rec.onend = rec.onerror = () => { b.textContent = "Voice"; b.setAttribute("aria-pressed", "false"); };
    rec.start();
  };
}

window.__marswalk = { goHome, startWalk, stopWalk, isWalking: () => walking, audio, toggleGhost, toggleMute, repeatCallout,
  state: () => ({ presenting: renderer.xr.isPresenting, placed, walking, playing, ghost: ghost.root.visible, home: homeLine,
    muted: audio.muted, buzz: buzzOn, fps, caption: caption?.text ?? null, t: walkNow ? +walkNow.t_min.toFixed(1) : null }) };

init().catch((e) => { console.error(e); setStatus("Load failed: " + e.message); });
