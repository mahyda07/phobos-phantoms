// Written with AI assistance (Claude).
// Phobos Phantoms — mixed-reality hologram of the Jezero walking area (task: headset hologram, track [P5]).
// Real NASA terrain on your desk in Quest 3 passthrough: hit-test placement, hands (move, two-hand scale),
// snap-rotate buttons, height exaggeration, photo/slope layer, route ribbon (planner route if present,
// otherwise Perseverance's real path as a labelled stand-in). No real-time shadows (PLAN.md D1).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";
import { makeFrame } from "./frame.js";
import { heightSampler, marginColour, holoScale } from "./terrain.js";

const DATA = "./data/";
const HOLO_SIZE = 0.6;            // metres across on the desk (PLAN: 1:2500 for 1.5 km)
const EXAGS = [1, 2, 4];          // height exaggeration options; default x2
const PINCH_ON = 0.02, PINCH_OFF = 0.035;
const statusEl = document.getElementById("status");
const setStatus = (t) => { statusEl.textContent = t; };

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
  applyScale(1);
  setStatus(info());
  enableButtons();
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
    holo.add(tubeFor(pts, pts.map((_, i) => marginColour(m[i])), 3));
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
function labelTex(text, bg = "#1d2733") {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = "#5b7186"; g.lineWidth = 6; g.strokeRect(3, 3, 250, 122);
  g.fillStyle = "#fff"; g.font = "bold 44px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function addButton(id, text, x, onPress) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.035), new THREE.MeshBasicMaterial({ map: labelTex(text), transparent: true }));
  mesh.position.set(x, 0, 0);
  mesh.rotation.x = -0.6;
  mesh.userData = { id, onPress, setText: (t) => { mesh.material.map.dispose(); mesh.material.map = labelTex(t); } };
  panel.add(mesh); buttons.push(mesh);
  return mesh;
}
const act = {
  rotL: () => { model.rotation.y += THREE.MathUtils.degToRad(15); },
  rotR: () => { model.rotation.y -= THREE.MathUtils.degToRad(15); },
  exag: () => { exagIdx = (exagIdx + 1) % EXAGS.length; applyScale(); bExag.userData.setText(`Height ×${EXAGS[exagIdx]}`); document.getElementById("btn-exag").textContent = `Height ×${EXAGS[exagIdx]}`; },
  layer: () => {
    layer = layer === "photo" ? "slope" : "photo";
    terrainMat.map = textures[layer] || textures.photo; terrainMat.needsUpdate = true;
    bLayer.userData.setText(layer === "photo" ? "Photo" : "Slope");
    document.getElementById("btn-layer").textContent = `Layer: ${layer}`;
  },
  replace: () => { placed = false; anchor.visible = false; },
};
addButton("rotL", "⟲ 15°", -0.16, act.rotL);
addButton("rotR", "⟳ 15°", -0.08, act.rotR);
const bExag = addButton("exag", "Height ×2", 0, act.exag);
const bLayer = addButton("layer", "Photo", 0.08, act.layer);
addButton("replace", "Re-place", 0.16, act.replace);
const infoMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.05), new THREE.MeshBasicMaterial({ transparent: true }));
infoMesh.position.set(0, 0.045, -0.01); infoMesh.rotation.x = -0.6;
panel.add(infoMesh);
let lastInfo = "";
function drawInfo(text) {
  if (text === lastInfo) return; lastInfo = text;
  const c = document.createElement("canvas"); c.width = 1024; c.height = 128;
  const g = c.getContext("2d"); g.fillStyle = "rgba(10,14,20,0.8)"; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = "#e8e8e8"; g.font = "30px system-ui, sans-serif"; g.textBaseline = "middle";
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
  const hit = ray.intersectObjects(buttons)[0];
  if (hit) hit.object.userData.onPress();
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
  await renderer.xr.setSession(session);
  scene.background = mode === "immersive-ar" ? null : desktopBg;
  placed = false; anchor.visible = false; sessionStart = performance.now();
  if (mode === "immersive-ar") {
    const viewer = await session.requestReferenceSpace("viewer");
    hitSource = await session.requestHitTestSource({ space: viewer });
  }
  session.addEventListener("end", () => {
    hitSource = null; scene.background = desktopBg; placed = true; anchor.visible = true;
    anchor.position.set(0, 0, 0); reticle.visible = false;
  });
}
function enableButtons() {
  const ar = document.getElementById("btn-ar"), vr = document.getElementById("btn-vr");
  if (!navigator.xr) { setStatus(info() + "\n(WebXR not available here — desktop preview only)"); return; }
  navigator.xr.isSessionSupported("immersive-ar").then((ok) => { ar.disabled = !ok; });
  navigator.xr.isSessionSupported("immersive-vr").then((ok) => { vr.disabled = !ok; });
  ar.onclick = () => enterXR("immersive-ar").catch((e) => setStatus("AR failed: " + e.message));
  vr.onclick = () => enterXR("immersive-vr").catch((e) => setStatus("VR failed: " + e.message));
}

function placeAt(pos) {   // put the hologram at pos, turned so the button panel faces the user
  const cam = renderer.xr.getCamera();
  anchor.position.copy(pos);
  anchor.rotation.set(0, Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z), 0);
  anchor.visible = true; placed = true; reticle.visible = false;
}
function placeInFront() {
  const cam = renderer.xr.getCamera();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); dir.y = 0; dir.normalize();
  const p = cam.position.clone().addScaledVector(dir, 0.6); p.y = cam.position.y - 0.45;
  placeAt(p);
}

// controllers: trigger = place / press button
const tmpM = new THREE.Matrix4();
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  ctrl.addEventListener("select", () => {
    if (!placed) { if (reticle.visible) placeAt(new THREE.Vector3().setFromMatrixPosition(reticle.matrix)); else placeInFront(); return; }
    tmpM.identity().extractRotation(ctrl.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
    const hit = ray.intersectObjects(buttons)[0];
    if (hit) hit.object.userData.onPress();
  });
  scene.add(ctrl);
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
  for (const b of buttons) { const d = b.getWorldPosition(new THREE.Vector3()).distanceTo(p); if (d < bd) { bd = d; best = b; } }
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
      if (b) { b.userData.onPress(); continue; }
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

// ---------- loop ----------
let frames = 0, t0 = performance.now();
renderer.setAnimationLoop((time, frame) => {
  frames++;
  const now = performance.now();
  if (now - t0 > 1000) { fps = Math.round(frames * 1000 / (now - t0)); frames = 0; t0 = now; drawInfo(info()); setStatus(info()); }
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
  } else orbit.update();
  renderer.render(scene, camera);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

init().catch((e) => { console.error(e); setStatus("Load failed: " + e.message); });
