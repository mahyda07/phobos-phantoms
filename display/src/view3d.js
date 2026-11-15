// Written with AI assistance (Claude).
// 3D terrain view for the web map (run 2, Phase 3a). Loaded on demand (dynamic import), so the 2D map stays as fast as
// before. Terrain mesh logic follows xr/src/main.js (PlaneGeometry rotated -90 deg, row 0 = north, heights - zRef).
// Shows: DEM heights with a vertical exaggeration slider (1x-3x, default 1.5x), the active route draped on the
// surface (same margin ramp as the 2D map), stops S1-S5 as labelled pins, the AI hazard layer as a texture toggle,
// Perseverance's real path, the current route point. OrbitControls + WASD pan + Q/E rotate. Track [P3] (by Ramish).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { heightSampler, pickLod, pixelRatioFor, clampExag, exagLabel, defaultCamera, topCamera, easeInOut, thin, rgbToUnit, EXAG_DEFAULT } from "./view3d-core.js";

const reduceMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

async function loadBin(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return new Float32Array(await r.arrayBuffer());
}
const loadTex = (url) => new Promise((res) => new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null)));

function textSprite(text, { bg = "rgba(12,17,26,0.88)", fg = "#eef2f6", border = "#ff7a3d" } = {}) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 112;
  const g = c.getContext("2d");
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, 248, 104, 26); g.fill(); g.lineWidth = 6; g.strokeStyle = border; g.stroke();
  g.fillStyle = fg; g.font = "700 64px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false }));
  s.renderOrder = 10;
  return s;
}

/**
 * host: element to fill (inside #map). opts: { f (frame), data: "./data/", meta (terrain.meta.json), route, rover,
 * stops: [{id,name,x,y}], rampColor(t) -> css, onReady() }. Returns the view API.
 */
export async function createView3D(host, { f, data, meta, route, rover, stops = [], rampColor }) {
  const extent = f.width * f.cell;
  const vw = host.clientWidth || innerWidth;
  const lod = pickLod(meta.lod, vw);
  const n = lod.width;
  const heights = await loadBin(data + lod.file);
  const sample = heightSampler(heights, n, extent);

  const renderer = new THREE.WebGLRenderer({ antialias: vw >= 700, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(pixelRatioFor(devicePixelRatio, vw));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "3D terrain view of the walking area");
  renderer.domElement.setAttribute("role", "img");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06090f);
  scene.fog = new THREE.Fog(0x06090f, extent * 2.2, extent * 4.5);
  const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 5, extent * 8);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 80; controls.maxDistance = extent * 3;

  // light: a fixed sun from the south-east for a readable overview (the headset uses window.json's EVA-start sun)
  scene.add(new THREE.HemisphereLight(0xfff1e0, 0x241a14, 0.55));
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.0);
  sun.position.set(extent * 1.2, extent * 1.1, extent * 1.6); scene.add(sun);

  // terrain: one group scaled in y by the exaggeration
  const world = new THREE.Group(); scene.add(world);
  const geo = new THREE.PlaneGeometry(extent, extent, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i] - f.zRef);
  geo.computeVertexNormals();
  const photo = await loadTex(data + "photo.png");
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: photo }));
  terrain.position.set(extent / 2, 0, extent / 2);
  world.add(terrain);
  const hazTex = await loadTex(data + "hazard.png");
  const hazard = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: hazTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  hazard.position.copy(terrain.position); hazard.visible = false; hazard.renderOrder = 1;
  if (hazTex) world.add(hazard);
  const base = new THREE.Mesh(new THREE.BoxGeometry(extent, 6, extent), new THREE.MeshBasicMaterial({ color: 0x2a1d16 }));
  base.position.set(extent / 2, -40, extent / 2); world.add(base);

  const at = (x, y, lift = 0) => { const [tx, ty, tz] = f.localToThree(x, y, sample(x, y)); return new THREE.Vector3(tx, ty + lift, tz); };
  const tube = (coords, radius, lift, doThin = true) => {
    const pts = (doThin ? thin(coords, 4) : coords).map(([x, y]) => at(x, y, lift));
    if (pts.length < 2) return null;
    const curve = new THREE.CurvePath();
    for (let i = 1; i < pts.length; i++) curve.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    return { g: new THREE.TubeGeometry(curve, pts.length - 1, radius, 6, false), n: pts.length - 1 };
  };

  // route: ramp-coloured core + soft glow
  let routeGroup = null, marker = null, routeCoords = [];
  function setRoute(r) {
    if (routeGroup) { world.remove(routeGroup); routeGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
    routeGroup = new THREE.Group(); world.add(routeGroup);
    routeCoords = r?.geometry?.coordinates || [];
    if (routeCoords.length < 2) return;
    const m = r.properties?.per_vertex?.margin_min || [];
    const mMax = Math.max(0, ...m.filter(Number.isFinite));
    const step = Math.max(1, Math.floor(routeCoords.length / 600));
    const coords = routeCoords.filter((_, i) => i % step === 0 || i === routeCoords.length - 1);
    const idx = coords.map((c) => routeCoords.indexOf(c));
    const core = tube(coords, 3.2, 3, false);   // coords already sampled: ring s = coords[s] (colours stay on their vertices)
    if (core) {
      const col = new Float32Array(core.g.attributes.position.count * 3);
      const radial = 7;
      for (let s = 0; s <= core.n; s++) {
        const k = idx[Math.min(s, idx.length - 1)];
        const rgb = rgbToUnit(rampColor(mMax > 0 ? m[k] / mMax : 0));
        for (let q = 0; q < radial; q++) col.set(rgb, (s * radial + q) * 3);
      }
      core.g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      routeGroup.add(new THREE.Mesh(core.g, new THREE.MeshBasicMaterial({ vertexColors: true })));
      const glow = tube(coords, 8, 3, false);
      routeGroup.add(new THREE.Mesh(glow.g, new THREE.MeshBasicMaterial({ color: 0xffb26b, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })));
    }
    marker = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    marker.add(new THREE.Mesh(new THREE.SphereGeometry(16, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0.35, depthWrite: false })));
    routeGroup.add(marker); setPoint(0);
  }
  function setPoint(i) {
    if (!marker || !routeCoords.length) return;
    const c = routeCoords[Math.max(0, Math.min(routeCoords.length - 1, i))];
    marker.position.copy(at(c[0], c[1], 12));
  }

  // stops: pins + labels
  const stopGroup = new THREE.Group(); world.add(stopGroup);
  for (const s of stops) {
    const p = at(s.x, s.y, 0);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 70, 8), new THREE.MeshBasicMaterial({ color: 0xff7a3d }));
    pin.position.set(p.x, p.y + 35, p.z); stopGroup.add(pin);
    const lab = textSprite(s.id); lab.position.set(p.x, p.y + 95, p.z); lab.scale.set(90, 40, 1); stopGroup.add(lab);
  }

  // Perseverance's real path (same blue as the 2D layer)
  let roverMesh = null;
  if (rover?.features?.length) {
    const gs = rover.features.map((ft) => tube(ft.geometry.coordinates, 2.2, 2)).filter(Boolean).map((t) => t.g);
    if (gs.length) { roverMesh = new THREE.Mesh(mergeGeometries(gs), new THREE.MeshBasicMaterial({ color: 0x7cc7ff })); gs.forEach((g) => g.dispose()); world.add(roverMesh); }
  }

  // home route (if a return route is planned later)
  let homeMesh = null;
  function setHome(coords) {
    if (homeMesh) { world.remove(homeMesh); homeMesh.geometry.dispose(); homeMesh = null; }
    const t = coords?.length > 1 ? tube(coords, 3.5, 4) : null;
    if (t) { homeMesh = new THREE.Mesh(t.g, new THREE.MeshBasicMaterial({ color: 0x7cc4ff })); world.add(homeMesh); }
  }

  let exag = EXAG_DEFAULT;
  const setExag = (v) => { exag = clampExag(v); world.scale.y = exag; return exagLabel(exag); };
  setExag(EXAG_DEFAULT);
  setRoute(route);

  // camera: reset + 0.5 s flight from the top-down 2D-like framing
  let anim = null;
  function flyTo(from, to, ms = 500) {
    if (reduceMotion() || ms <= 0) { camera.position.set(...to.position); controls.target.set(...to.target); controls.update(); return; }
    anim = { from, to, t0: performance.now(), ms };
  }
  const reset = () => flyTo(null, defaultCamera(extent), 0);

  // keyboard: WASD pan, Q/E rotate (only while visible and not typing)
  const keys = new Set();
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
  const onKey = (e) => {
    if (!visible || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if ("wasdqe".includes(k) && k.length === 1) { if (e.type === "keydown") keys.add(k); else keys.delete(k); e.preventDefault(); }
  };
  addEventListener("keydown", onKey); addEventListener("keyup", onKey);
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  function applyKeys(dt) {
    if (!keys.size) return;
    const speed = extent * 0.5 * dt;
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, camera.up).normalize();
    tmp.set(0, 0, 0);
    if (keys.has("w")) tmp.add(fwd); if (keys.has("s")) tmp.sub(fwd);
    if (keys.has("d")) tmp.add(right); if (keys.has("a")) tmp.sub(right);
    if (tmp.lengthSq()) { tmp.normalize().multiplyScalar(speed); camera.position.add(tmp); controls.target.add(tmp); }
    const rot = (keys.has("q") ? 1 : 0) - (keys.has("e") ? 1 : 0);
    if (rot) { const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * dt * 1.2); camera.position.copy(controls.target).add(off); }
  }

  // stop Leaflet from treating 3D drags / wheel as map input
  for (const ev of ["pointerdown", "mousedown", "touchstart", "wheel", "dblclick", "click"]) host.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== "wheel" });

  const onResize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  addEventListener("resize", onResize);

  let visible = false, last = performance.now();
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.ms), e = easeInOut(k);
      const a = anim.from || anim.to;
      camera.position.set(...a.position.map((v, i) => v + (anim.to.position[i] - v) * e));
      controls.target.set(...a.target.map((v, i) => v + (anim.to.target[i] - v) * e));
      if (k >= 1) anim = null;
    }
    applyKeys(dt);
    controls.update();
    renderer.render(scene, camera);
  });

  reset();
  return {
    show() { visible = true; onResize(); flyTo(topCamera(extent), defaultCamera(extent)); host.hidden = false; },
    hide() { visible = false; host.hidden = true; keys.clear(); },
    get visible() { return visible; },
    setExag, get exag() { return exag; },
    setRoute, setPoint, setHome,
    setHazard(on) { hazard.visible = !!on && !!hazTex; return hazard.visible; }, get hazard() { return hazard.visible; }, hasHazard: !!hazTex,
    setRover(on) { if (roverMesh) roverMesh.visible = !!on; return !!roverMesh?.visible; }, get rover() { return !!roverMesh?.visible; },
    reset() { flyTo(null, defaultCamera(extent), 400); },
    zoom(f) { const off = camera.position.clone().sub(controls.target).multiplyScalar(f); camera.position.copy(controls.target).add(off); },
    info: () => ({ lod: n, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() }),
  };
}
