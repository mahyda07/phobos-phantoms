// Written with AI assistance (Claude).
// 3D terrain view for the web map (run 2, Phase 3a; console look 15 Nov). Loaded on demand (dynamic import), so the 2D
// map stays as fast as before. Terrain mesh logic follows xr/src/main.js (PlaneGeometry rotated -90 deg, row 0 = north,
// heights - zRef). Shows: DEM heights with a vertical exaggeration slider (1x-4x, default 1.5x) as a red "Relief"
// surface (a display tint of the real heights, with its own legend) or the untinted HiRISE "Photo"; the active route as
// a thin line with the same margin ramp as the 2D map; Start / End markers; stops as labelled pins; the raster layers
// draped as textures (never smoothed); Perseverance's real path; the previous route (compare) as a dashed grey line;
// the current route point and the hover-preview ghost. OrbitControls + WASD pan + Q/E rotate. Hover / click on the
// route is done in screen space (view3d-core.js). Track [P3] (by Ramish).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { heightSampler, pickLod, pixelRatioFor, clampExag, exagLabel, defaultCamera, topCamera, easeInOut, thin, rgbToUnit, EXAG_DEFAULT,
  reliefColor, reliefCss, srgbToLinear, heightLabel, projectToScreen, nearestScreenPoint, distToSegment, isClick } from "./view3d-core.js";

const reduceMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const LAYER_IDS = ["slope", "rough", "dem", "hazard", "science"];   // data/<id>.png, same ids as the 2D overlays
const LAYER_OPACITY = 0.6;                                           // same as OVERLAY_OPACITY on the 2D map
const ROUTE_LIFT = 3, PIN_M = 100, STOP_PIN_M = 64, LABEL_PX = 22;   // metres above the surface / pin heights / label height on screen
const HOVER_PX = 12, TOUCH_PX = 20;
const C = { start: "#5ee2a0", end: "#ff6b5e", mars: "#ff7a3d", rover: "#7cc7ff", home: "#7cc4ff", prev: "#9aa3ad", casing: "#0b0d10" };

async function loadBin(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return new Float32Array(await r.arrayBuffer());
}
const loadTex = (url, nearest = false) => new Promise((res) => new THREE.TextureLoader().load(url, (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; } // data layers are never smoothed
  else t.anisotropy = 4;
  res(t);
}, undefined, () => res(null)));

const disposeTree = (o) => o?.traverse((c) => { c.geometry?.dispose(); if (c.material) { c.material.map?.dispose(); c.material.dispose(); } });

/** Small text label drawn on a canvas (monospace, dark plate, coloured outline). Its screen height is set by the caller. */
function textSprite(text, { fg = "#eef2f6", border = C.mars } = {}) {
  const font = '600 26px "JetBrains Mono", ui-monospace, monospace';
  const c = document.createElement("canvas");
  let g = c.getContext("2d"); g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 28; c.height = 44;
  g = c.getContext("2d");
  g.fillStyle = "rgba(8,11,16,0.9)"; g.beginPath(); g.roundRect(2, 2, c.width - 4, 40, 8); g.fill(); g.lineWidth = 2.5; g.strokeStyle = border; g.stroke();
  g.fillStyle = fg; g.font = font; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, c.width / 2, 23);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, sizeAttenuation: false }));
  s.center.set(0.5, 0); s.renderOrder = 10; s.userData.aspect = c.width / c.height;
  return s;
}

/**
 * host: element to fill (inside #map). opts: { f (frame), data: "data/", meta (terrain.meta.json), route, rover,
 * stops: [{id,name,x,y}], rampColor(t) -> css, layers: ids of the data/<id>.png files that exist,
 * onPoint(i) (click on the route), onPreview(i) / onPreviewEnd() (hover), onStop(id) (click on a stop pin) }.
 * Returns the view API (see the return statement).
 */
export async function createView3D(host, { f, data, meta, route, rover, stops = [], rampColor, layers = LAYER_IDS,
  onPoint = () => {}, onPreview = () => {}, onPreviewEnd = () => {}, onStop = () => {} }) {
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
  const el = renderer.domElement;
  host.insertBefore(el, host.firstChild);
  el.setAttribute("aria-label", "3D terrain view of the walking area");
  el.setAttribute("role", "img");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06090f);
  scene.fog = new THREE.Fog(0x06090f, extent * 2.6, extent * 5);
  const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 5, extent * 8);
  const controls = new OrbitControls(camera, el);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 80; controls.maxDistance = extent * 3.4;
  const aspect = () => (host.clientWidth && host.clientHeight ? host.clientWidth / host.clientHeight : 1.6);

  // light. Photo: the fixed south-east sun used since Phase 3a. Relief: a low sun from the west so the relief reads.
  const hemi = new THREE.HemisphereLight(0xfff1e0, 0x241a14, 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.0); scene.add(sun);
  const RIGS = {
    photo: { hemi: 0.55, sun: 3.0, pos: [1.2, 1.1, 1.6] },
    relief: { hemi: 0.5, sun: 4.4, pos: [-1.5, 0.62, 0.55] },
  };

  // terrain: one group scaled in y by the exaggeration
  const world = new THREE.Group(); scene.add(world);
  const geo = new THREE.PlaneGeometry(extent, extent, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i] - f.zRef);
  geo.computeVertexNormals();
  // Relief tint: colour by height between the DEM's lowest and highest point (terrain.meta.json z_min / z_max).
  let zLo = meta.z_min, zHi = meta.z_max;
  const legendText = heightLabel(zLo, zHi);
  if (!legendText) { zLo = Infinity; zHi = -Infinity; for (const h of heights) { if (h < zLo) zLo = h; if (h > zHi) zHi = h; } }
  {
    const lut = new Float32Array(256 * 3);
    for (let k = 0; k < 256; k++) lut.set(reliefColor(k / 255).map(srgbToLinear), k * 3);
    const col = new Float32Array(pos.count * 3), span = zHi - zLo || 1;
    for (let i = 0; i < pos.count; i++) {
      const k = Math.max(0, Math.min(255, Math.round(((heights[i] - zLo) / span) * 255))) * 3;
      col[i * 3] = lut[k]; col[i * 3 + 1] = lut[k + 1]; col[i * 3 + 2] = lut[k + 2];
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  const mats = { relief: new THREE.MeshLambertMaterial({ vertexColors: true }), photo: null };
  const terrain = new THREE.Mesh(geo, mats.relief);
  terrain.position.set(extent / 2, 0, extent / 2);
  world.add(terrain);

  // skirt: closes the sides of the terrain block down to a flat base (replaces the floating slab)
  {
    const BASE_Y = -30, p = [], idx = [];
    const edge = (cells) => {
      const o = p.length / 3;
      cells.forEach(([r, c]) => { const x = (c / (n - 1)) * extent, z = (r / (n - 1)) * extent; p.push(x, heights[r * n + c] - f.zRef, z, x, BASE_Y, z); });
      for (let i = 0; i < cells.length - 1; i++) { const a = o + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    };
    const seq = [...Array(n).keys()];
    edge(seq.map((c) => [0, c])); edge(seq.map((c) => [n - 1, c])); edge(seq.map((r) => [r, 0])); edge(seq.map((r) => [r, n - 1]));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setIndex(idx);
    world.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x1c0c08, side: THREE.DoubleSide })));
  }

  // backdrop (decoration only, never picked or measured): a Mars dusk sky (butterscotch dust near the horizon, the
  // blue glow Mars has around a low sun), twinkling stars, Phobos and Deimos, a distant crater-rim silhouette and a
  // warm plain under the terrain block, so the block sits in a scene instead of floating in black.
  const backdrop = { tick: () => {} };
  {
    const c = extent / 2, R = extent * 3.6;
    const sunDir = new THREE.Vector3(1.2, 0.10, 1.6).normalize();
    const skyU = { zen: { value: new THREE.Color(0x060a1c) }, mid: { value: new THREE.Color(0x24284a) }, hor: { value: new THREE.Color(0xb0643a) },
      sun: { value: sunDir }, t: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 zen, mid, hor, sun; uniform float t; varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float noise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(hor, mid, smoothstep(-0.03, 0.28, h));
          col = mix(col, zen, smoothstep(0.28, 0.85, h));
          float sd = max(dot(d, sun), 0.0);
          col += vec3(0.35, 0.55, 0.95) * pow(sd, 18.0) * 0.9;              // blue sunset halo
          col += vec3(1.0, 0.55, 0.28) * pow(sd, 3.0) * 0.35 * (1.0 - smoothstep(0.0, 0.45, h));
          col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9998, sd);   // small sun disc
          // milky-way band: soft noisy stripe across the sky
          vec3 axis = normalize(vec3(0.3, 0.8, -0.5));
          float band = exp(-pow(dot(d, axis) / 0.16, 2.0));
          float n = noise(d * 9.0) * 0.6 + noise(d * 23.0) * 0.4;
          col += vec3(0.55, 0.50, 0.75) * band * n * 0.22 * smoothstep(0.08, 0.4, h);
          // drifting dust haze near the horizon
          col += vec3(0.30, 0.14, 0.07) * noise(vec3(d.x * 6.0 + t * 0.01, h * 18.0, d.z * 6.0)) * (1.0 - smoothstep(0.0, 0.2, abs(h))) * 0.5;
          if (h < -0.03) col = mix(hor * 0.6, vec3(0.05, 0.025, 0.02), smoothstep(-0.03, -0.35, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    sky.position.set(c, 0, c); sky.renderOrder = -10; sky.raycast = () => {};
    scene.add(sky);

    // stars: twinkle slowly (shader), brighter and more numerous than a plain point cloud
    const N = 2600, sp = new Float32Array(N * 3), sa = new Float32Array(N * 2);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const th = rnd() * Math.PI * 2, y = 0.06 + Math.pow(rnd(), 0.8) * 0.94, r = Math.sqrt(1 - y * y);
      sp.set([c + Math.cos(th) * r * R * 0.96, y * R * 0.96, c + Math.sin(th) * r * R * 0.96], i * 3);
      sa.set([0.25 + Math.pow(rnd(), 3) * 0.75, rnd() * 6.283], i * 2);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3)); sg.setAttribute("aStar", new THREE.BufferAttribute(sa, 2));
    const starU = { t: { value: 0 }, px: { value: Math.min(devicePixelRatio || 1, 2) } };
    const stars = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, uniforms: starU,
      vertexShader: `attribute vec2 aStar; uniform float t, px; varying float vB;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float hgt = clamp(position.y / ${(R * 0.96).toFixed(1)}, 0.0, 1.0);
          vB = aStar.x * (0.65 + 0.35 * sin(t * (0.6 + aStar.y * 0.3) + aStar.y * 10.0)) * smoothstep(0.06, 0.3, hgt);
          gl_PointSize = (1.2 + aStar.x * 3.0) * px; }`,
      fragmentShader: `varying float vB; void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(q));
          gl_FragColor = vec4(vec3(0.92, 0.94, 1.0) * vB * a, 1.0); }`,
    }));
    stars.renderOrder = -9; stars.raycast = () => {};
    scene.add(stars);

    // Phobos and Deimos: two small soft moons (decoration)
    const moonTex = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d");
      const gr = g.createRadialGradient(28, 28, 2, 32, 32, 30); gr.addColorStop(0, "rgba(235,225,210,1)"); gr.addColorStop(0.55, "rgba(170,150,130,.95)"); gr.addColorStop(0.7, "rgba(120,100,90,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx; })();
    for (const [az, el, size] of [[-0.9, 0.42, 110], [2.3, 0.62, 55]]) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
      const r = Math.cos(el) * R * 0.93; m.position.set(c + Math.cos(az) * r, Math.sin(el) * R * 0.93, c + Math.sin(az) * r);
      m.scale.set(size, size, 1); m.renderOrder = -8; m.raycast = () => {}; scene.add(m);
    }

    // distant crater-rim silhouette all around (procedural, not real topography)
    {
      const seg = 360, rr = extent * 2.9, pos = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const hgt = extent * (0.05 + 0.035 * Math.sin(a * 3 + 1.3) + 0.025 * Math.sin(a * 7 + 0.4) + 0.012 * Math.sin(a * 17 + 2.1) + 0.006 * Math.sin(a * 41));
        const x = c + Math.cos(a) * rr, z = c + Math.sin(a) * rr;
        pos.push(x, -40, z, x, Math.max(10, hgt), z);
        if (i < seg) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const rim = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3a1a10, side: THREE.DoubleSide, fog: true }));
      rim.renderOrder = -7; rim.raycast = () => {}; scene.add(rim);
    }

    // plain under the terrain: warm near the block, dusty toward the rim, faint distance rings
    const plain = new THREE.Mesh(new THREE.CircleGeometry(extent * 3.2, 96), new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: { near: { value: new THREE.Color(0x5a2914) }, far: { value: new THREE.Color(0x8a4826) }, ext: { value: extent } },
      vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 near, far; uniform float ext; varying vec2 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          float d = length(vP) / ext;
          vec3 col = mix(near, far, smoothstep(0.5, 3.0, d));
          col *= 0.85 + 0.15 * hash(floor(vP / 18.0));                     // dusty grain
          float ring = (1.0 - smoothstep(0.0, 0.05, abs(fract(d * 2.0) - 0.5) - 0.45)) * 0.10 * (1.0 - smoothstep(0.8, 2.4, d));
          col += vec3(1.0, 0.6, 0.35) * ring;
          col += vec3(0.5, 0.22, 0.1) * (1.0 - smoothstep(0.55, 1.1, d)) * 0.35;   // light pool under the block
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    plain.rotation.x = -Math.PI / 2; plain.position.set(c, -30.5, c); plain.raycast = () => {};
    world.add(plain);

    backdrop.tick = (now) => { const s = now / 1000; starU.t.value = s; skyU.t.value = s; };
  }
  scene.fog.color.set(0x6a3520);
  scene.fog.near = extent * 2.2; scene.fog.far = extent * 4.2;

  // surface: "relief" (default) or "photo" (the HiRISE photo, untinted, loaded on first use)
  let surface = "relief", photoLoading = null;
  const legend = document.createElement("div");
  legend.className = "v3d-legend";
  if (legendText) {
    legend.setAttribute("role", "group"); legend.setAttribute("aria-label", legendText.text);
    legend.innerHTML = `<div class="v3d-legend-title">Height (HiRISE DTM)</div><div class="v3d-legend-bar" style="background:${reliefCss()}"></div>
      <div class="v3d-legend-ends"><span>${legendText.low}</span><span>${legendText.high}</span></div>
      <div class="v3d-legend-note">Colour shows height only. It is a display tint, not the real surface colour.</div>`;
    host.appendChild(legend);
  }
  function applySurface() {
    const rig = RIGS[surface];
    hemi.intensity = rig.hemi; sun.intensity = rig.sun; sun.position.set(...rig.pos.map((v) => v * extent));
    terrain.material = surface === "photo" && mats.photo ? mats.photo : mats.relief;
    legend.hidden = terrain.material !== mats.relief;
  }
  function setSurface(s) {
    surface = s === "photo" ? "photo" : "relief";
    if (surface === "photo" && !mats.photo) {
      photoLoading ||= loadTex(data + "photo.png").then((t) => { if (t) mats.photo = new THREE.MeshLambertMaterial({ map: t }); applySurface(); });
      return surface;
    }
    applySurface();
    return surface;
  }
  applySurface();

  // raster layers draped on the terrain (same PNGs as the 2D overlays, textures loaded on first use)
  const layerState = {};
  function setLayer(id, on) {
    if (!LAYER_IDS.includes(id) || !layers.includes(id)) return false;
    const st = (layerState[id] ||= { want: false, mesh: null, loading: null });
    st.want = !!on;
    if (st.mesh) st.mesh.visible = st.want;
    else if (st.want && !st.loading) {
      st.loading = loadTex(`${data}${id}.png`, true).then((tex) => {
        if (!tex) return;
        const k = LAYER_IDS.indexOf(id);
        st.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: LAYER_OPACITY, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2 - k, polygonOffsetUnits: -2 - k }));
        st.mesh.position.copy(terrain.position); st.mesh.renderOrder = 1 + k; st.mesh.visible = st.want;
        world.add(st.mesh);
      });
    }
    return st.want;
  }
  const layerOn = (id) => !!layerState[id]?.want;

  // ---- lines (constant width in screen pixels; LineMaterial.resolution is refreshed by Line2 before every draw) ----
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // hex is sRGB, the result is linear
  const ground = (x, y) => sample(x, y) - f.zRef;
  const flat = (coords, lift) => { const out = new Float32Array(coords.length * 3); coords.forEach(([x, y], i) => { out[i * 3] = x; out[i * 3 + 1] = ground(x, y) + lift; out[i * 3 + 2] = -y; }); return out; };
  const lineMat = (o) => new LineMaterial({ linewidth: 3, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, ...o });
  function polyline(coords, lift, matOpts, colors) {
    if (!coords || coords.length < 2) return null;
    const g = new LineGeometry(); g.setPositions(flat(coords, lift));
    if (colors) g.setColors(colors);
    const l = new Line2(g, lineMat({ vertexColors: !!colors, ...matOpts }));
    if (matOpts.dashed) l.computeLineDistances();
    return l;
  }

  // ---- markers: an unscaled group, so dots stay round and pins keep their height at any exaggeration ----
  let exag = EXAG_DEFAULT;
  const pins = new THREE.Group(); scene.add(pins);
  const labels = [];   // sprites that keep LABEL_PX on screen
  const sizeLabel = (s) => { const k = (LABEL_PX / (host.clientHeight || 900)) * 2 * Math.tan((camera.fov * Math.PI) / 360); s.scale.set(k * s.userData.aspect, k, 1); };
  const place = (g) => g.position.set(g.userData.x, ground(g.userData.x, g.userData.y) * exag + (g.userData.lift || 0), -g.userData.y);
  const ball = (r, color, o = {}) => new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshBasicMaterial({ color, ...o }));
  const stem = (h, color, o = {}) => { const g = new LineGeometry(); g.setPositions([0, 0, 0, 0, h, 0]); return new Line2(g, new LineMaterial({ linewidth: 1.6, color, ...o })); };
  /** A marker standing on the terrain at local (x, y): optional base dot, vertical stem with a small head, text label. */
  function pin(x, y, { dot = null, height = 0, color = C.mars, head = 0, label = null, labelColor = color, labelAt = height + head + 6 } = {}) {
    const g = new THREE.Group(); g.userData = { x, y };
    if (dot) { const d = ball(8, dot); d.position.y = 3; g.add(d); }
    if (height) g.add(stem(height, color));
    if (head) { const hd = ball(head, color); hd.position.y = height; g.add(hd); }
    if (label) { const s = textSprite(label, { border: labelColor }); s.position.y = labelAt; sizeLabel(s); labels.push(s); g.add(s); }
    place(g);
    return g;
  }
  const dropGroup = (g) => { if (!g) return; g.traverse((c) => { const k = labels.indexOf(c); if (k >= 0) labels.splice(k, 1); }); g.parent?.remove(g); disposeTree(g); };

  // ---- route: thin ramp-coloured line on a dark casing, Start / End markers, position marker, hover ghost ----
  let routeGroup = null, routePins = null, marker = null, ghost = null, routeCoords = [], routeWorld = new Float32Array(0), routeOn = true, pointIndex = 0;
  function setRoute(r) {
    if (routeGroup) { world.remove(routeGroup); disposeTree(routeGroup); }
    dropGroup(routePins); marker = null; ghost = null;
    routeGroup = new THREE.Group(); world.add(routeGroup);
    routePins = new THREE.Group(); pins.add(routePins);
    routeGroup.visible = routePins.visible = routeOn;
    routeCoords = r?.geometry?.coordinates || [];
    routeWorld = flat(routeCoords, ROUTE_LIFT); pickDirty = true;
    if (routeCoords.length < 2) return;
    const m = r.properties?.per_vertex?.margin_min || [];
    const mMax = Math.max(0, ...m.filter(Number.isFinite));
    const col = new Float32Array(routeCoords.length * 3);   // locked margin ramp (route.js rampColor), scaled as on the 2D map
    for (let i = 0; i < routeCoords.length; i++) col.set(rgbToUnit(rampColor(mMax > 0 ? m[i] / mMax : 0)).map(srgbToLinear), i * 3);
    const casing = polyline(routeCoords, ROUTE_LIFT, { color: C.casing, linewidth: 5.5, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const core = polyline(routeCoords, ROUTE_LIFT, { linewidth: 3 }, col);
    casing.renderOrder = 6; core.renderOrder = 7;
    routeGroup.add(casing, core);

    const a = routeCoords[0], b = routeCoords[routeCoords.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < f.cell) {   // a loop walk: the route ends where it starts
      routePins.add(pin(a[0], a[1], { dot: C.start, height: PIN_M, color: C.end, head: 5, label: "Start / End" }));
    } else {
      routePins.add(pin(a[0], a[1], { dot: C.start, color: C.start, label: "Start", labelAt: 22 }));
      routePins.add(pin(b[0], b[1], { dot: C.end, height: PIN_M, color: C.end, head: 5, label: "End" }));
    }
    marker = new THREE.Group(); marker.userData = { x: a[0], y: a[1], lift: 6 };
    marker.add(ball(7, 0xffffff), ball(13, C.mars, { transparent: true, opacity: 0.35, depthWrite: false }), stem(70, 0xffffff));
    ghost = new THREE.Group(); ghost.userData = { x: a[0], y: a[1], lift: 6 }; ghost.visible = false;
    ghost.add(ball(6, 0xffffff, { transparent: true, opacity: 0.55, depthWrite: false }), stem(40, 0xffffff, { transparent: true, opacity: 0.55 }));
    routePins.add(marker, ghost);
    setPoint(0);
  }
  const clampIdx = (i) => Math.max(0, Math.min(routeCoords.length - 1, Math.round(Number(i)) || 0));
  function setPoint(i) {
    if (!marker || !routeCoords.length) return;
    pointIndex = clampIdx(i);
    const c = routeCoords[pointIndex];
    marker.userData.x = c[0]; marker.userData.y = c[1]; place(marker);
    if (follow) glideToPoint();
  }
  function setGhost(i) {
    if (!ghost || !routeCoords.length) return;
    const c = routeCoords[clampIdx(i)];
    ghost.userData.x = c[0]; ghost.userData.y = c[1]; place(ghost); ghost.visible = true;
  }
  const clearGhost = () => { if (ghost) ghost.visible = false; };

  // previous route (compare.js): thin dashed light-grey line under the current route
  let compareLine = null;
  function setCompare(prev) {
    if (compareLine) { world.remove(compareLine); disposeTree(compareLine); compareLine = null; }
    compareLine = polyline(prev?.geometry?.coordinates, ROUTE_LIFT - 1, { color: C.prev, linewidth: 2.5, dashed: true, dashSize: 14, gapSize: 12, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    if (compareLine) { compareLine.renderOrder = 5; world.add(compareLine); }
    return !!compareLine;
  }

  // stops: thin pins + labels (click -> onStop)
  let stopGroup = null, stopList = [], stopsOn = true;
  function setStops(list) {
    dropGroup(stopGroup);
    stopList = (list || []).filter((s) => Number.isFinite(s?.x) && Number.isFinite(s?.y));
    stopGroup = new THREE.Group(); stopGroup.visible = stopsOn; pins.add(stopGroup);
    for (const s of stopList) stopGroup.add(pin(s.x, s.y, { height: STOP_PIN_M, color: C.mars, label: String(s.id), labelAt: STOP_PIN_M }));
  }
  setStops(stops);

  // Perseverance's real path (same blue as the 2D layer): all drives in one draw call
  let roverMesh = null;
  if (rover?.features?.length) {
    const seg = [];
    for (const ft of rover.features) {
      if (ft.geometry?.type !== "LineString") continue;
      const p = flat(thin(ft.geometry.coordinates, 4), 2);
      for (let i = 0; i + 5 < p.length; i += 3) seg.push(p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5]);
    }
    if (seg.length) {
      const g = new LineSegmentsGeometry(); g.setPositions(seg);
      roverMesh = new LineSegments2(g, lineMat({ color: C.rover, linewidth: 2.2, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
      roverMesh.renderOrder = 4; world.add(roverMesh);
    }
  }

  // home route (if a return route is planned later)
  let homeMesh = null;
  function setHome(coords) {
    if (homeMesh) { world.remove(homeMesh); disposeTree(homeMesh); homeMesh = null; }
    homeMesh = polyline(coords?.length > 1 ? thin(coords, 4) : null, ROUTE_LIFT + 1, { color: C.home, linewidth: 3 });
    if (homeMesh) { homeMesh.renderOrder = 5; world.add(homeMesh); }
  }

  const setExag = (v) => {
    exag = clampExag(v); world.scale.y = exag; pickDirty = true;
    for (const grp of pins.children) for (const g of grp.children) place(g);
    return exagLabel(exag);
  };

  // camera: reset + 0.5 s flight from the top-down 2D-like framing
  let anim = null;
  function flyTo(from, to, ms = 500) {
    if (reduceMotion() || ms <= 0) { camera.position.set(...to.position); controls.target.set(...to.target); controls.update(); return; }
    anim = { from, to, t0: performance.now(), ms };
  }
  const home = () => defaultCamera(extent, aspect());
  const reset = () => flyTo(null, home(), 0);

  // follow (moving-map "Follow"): the camera target glides to the current route point, keeping the viewing angle
  let follow = false, gliding = false;
  const glideGoal = new THREE.Vector3(), glideStep = new THREE.Vector3();
  function glideToPoint() {
    if (!marker) return;
    glideGoal.copy(marker.position); gliding = true;
    if (reduceMotion() || !visible) { glideStep.copy(glideGoal).sub(controls.target); controls.target.add(glideStep); camera.position.add(glideStep); gliding = false; }
  }
  function setFollow(on) { follow = !!on; if (follow) glideToPoint(); else gliding = false; return follow; }

  // ---- hover / click on the route and the stop pins, in screen space (no raycasting of 1887 segments) ----
  let pickXY = new Float32Array(0), pickDirty = true;
  const vp = new THREE.Matrix4(), v3 = new THREE.Vector3();
  controls.addEventListener("change", () => { pickDirty = true; });
  function routeAt(px, py, radius) {
    if (!routeOn || routeCoords.length < 2) return -1;
    if (pickDirty) {
      pickDirty = false;
      if (pickXY.length !== routeCoords.length * 2) pickXY = new Float32Array(routeCoords.length * 2);
      camera.updateMatrixWorld(); world.updateMatrixWorld();
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(world.matrixWorld);
      projectToScreen(routeWorld, vp.elements, el.clientWidth, el.clientHeight, pickXY);
    }
    return nearestScreenPoint(pickXY, px, py, radius);
  }
  const toScreen = (x, y, z) => { v3.set(x, y, z).project(camera); return v3.z > 1 || v3.z < -1 ? null : [(v3.x * 0.5 + 0.5) * el.clientWidth, (0.5 - v3.y * 0.5) * el.clientHeight]; };
  function stopAt(px, py) {
    if (!stopsOn || !stopGroup) return null;
    for (let k = 0; k < stopList.length; k++) {
      const g = stopGroup.children[k], a = toScreen(g.position.x, g.position.y, g.position.z), b = toScreen(g.position.x, g.position.y + STOP_PIN_M, g.position.z);
      if (!a || !b) continue;
      const w = (LABEL_PX * (g.children[g.children.length - 1].userData.aspect || 2)) / 2 + 3;
      if (distToSegment(px, py, a[0], a[1], b[0], b[1]) <= 7 || (Math.abs(px - b[0]) <= w && py <= b[1] + 3 && py >= b[1] - LABEL_PX - 3)) return stopList[k];
    }
    return null;
  }
  const local = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let hoverIdx = -1, down = null, touches = 0;
  const endHover = () => { if (hoverIdx >= 0) { hoverIdx = -1; onPreviewEnd(); } el.style.cursor = ""; };
  el.addEventListener("pointerdown", (e) => { touches++; down = touches === 1 ? { x: e.clientX, y: e.clientY } : null; });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    if (e.buttons) { if (down && !isClick(down.x, down.y, e.clientX, e.clientY)) endHover(); return; }   // orbit drag
    const [px, py] = local(e);
    if (stopAt(px, py)) { if (hoverIdx >= 0) { hoverIdx = -1; onPreviewEnd(); } el.style.cursor = "pointer"; return; }
    const i = routeAt(px, py, HOVER_PX);
    if (i < 0) { endHover(); return; }
    el.style.cursor = "pointer";
    if (i !== hoverIdx) { hoverIdx = i; onPreview(i); }
  });
  const onUp = (e) => {
    touches = Math.max(0, touches - 1);
    const d = down; down = null;
    if (e.type !== "pointerup" || !d || e.button > 0 || !isClick(d.x, d.y, e.clientX, e.clientY)) return;   // not after an orbit drag
    const [px, py] = local(e);
    const s = stopAt(px, py);
    if (s) { onStop(s.id); return; }
    const i = routeAt(px, py, e.pointerType === "touch" ? TOUCH_PX : HOVER_PX);
    if (i >= 0) onPoint(i);
  };
  el.addEventListener("pointerup", onUp); el.addEventListener("pointercancel", onUp);
  el.addEventListener("pointerleave", (e) => { if (!e.buttons) endHover(); });

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

  const onResize = () => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    labels.forEach(sizeLabel); pickDirty = true;
  };
  addEventListener("resize", onResize);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(onResize).observe(host);   // the sidebar can resize the map area without a window resize

  let visible = false, last = performance.now(), fps = 0;
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const now = performance.now(), raw = (now - last) / 1000, dt = Math.min(0.1, raw); last = now;
    if (!reduceMotion()) backdrop.tick(now);
    if (raw > 0 && raw < 1) fps = fps ? fps * 0.9 + (1 / raw) * 0.1 : 1 / raw;
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.ms), e = easeInOut(k);
      const a = anim.from || { position: camera.position.toArray(), target: controls.target.toArray() };
      anim.from = a;
      camera.position.set(...a.position.map((v, i) => v + (anim.to.position[i] - v) * e));
      controls.target.set(...a.target.map((v, i) => v + (anim.to.target[i] - v) * e));
      if (k >= 1) anim = null;
    } else if (gliding) {
      glideStep.copy(glideGoal).sub(controls.target);
      if (glideStep.lengthSq() < 0.25) gliding = false;
      else { glideStep.multiplyScalar(1 - Math.exp(-dt * 5)); controls.target.add(glideStep); camera.position.add(glideStep); }
    }
    applyKeys(dt);
    controls.update();
    renderer.render(scene, camera);
  });

  setExag(EXAG_DEFAULT);
  setRoute(route);
  reset();
  return {
    show() { visible = true; host.hidden = false; onResize(); last = performance.now(); flyTo(topCamera(extent), home()); },
    hide() { visible = false; host.hidden = true; keys.clear(); endHover(); },
    get visible() { return visible; },
    setExag, get exag() { return exag; },
    setSurface, get surface() { return surface; },
    setRoute, setPoint, setGhost, clearGhost, setHome, setCompare, setStops,
    setRouteVisible(on) { routeOn = !!on; if (routeGroup) routeGroup.visible = routeOn; if (routePins) routePins.visible = routeOn; if (!routeOn) endHover(); return routeOn; },
    get routeVisible() { return routeOn; },
    setStopsVisible(on) { stopsOn = !!on; if (stopGroup) stopGroup.visible = stopsOn; return stopsOn; },
    get stopsVisible() { return stopsOn; },
    setLayer, layer: layerOn, get layers() { return LAYER_IDS.filter(layerOn); },
    setHazard: (on) => setLayer("hazard", on), get hazard() { return layerOn("hazard"); }, hasHazard: layers.includes("hazard"),
    setRover(on) { if (roverMesh) roverMesh.visible = !!on; return !!roverMesh?.visible; }, get rover() { return !!roverMesh?.visible; },
    setFollow, get follow() { return follow; },
    reset() { flyTo(null, home(), 400); },
    zoom(k) { const off = camera.position.clone().sub(controls.target).multiplyScalar(k); camera.position.copy(controls.target).add(off); },
    /** Screen position (CSS px inside the 3D canvas) of route point i, or null if it is off screen. For tests / QA. */
    pointOnScreen(i) { routeAt(0, 0, 0); const k = clampIdx(i) * 2; return Number.isFinite(pickXY[k]) ? [pickXY[k], pickXY[k + 1]] : null; },
    info: () => ({ lod: n, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio(),
      fps: Math.round(fps), surface, layers: LAYER_IDS.filter(layerOn), point: pointIndex, ghost: !!ghost?.visible, follow }),
  };
}
