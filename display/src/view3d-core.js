// Written with AI assistance (Claude).
// Pure helpers for the web map's 3D terrain view (run 2, Phase 3a). No Three.js / DOM, unit-tested in view3d.test.mjs.
// heightSampler is copied from xr/src/terrain.js (same grid convention: row 0 = north, x east, y north = negative down
// the grid) so both apps drape lines on the terrain the same way. Track [P3] (change by Ramish, logged).

/** Bilinear height sampler over an n x n float32 grid spanning extentM metres (copy of xr/src/terrain.js). */
export function heightSampler(heights, n, extentM) {
  const k = (n - 1) / extentM;
  return (x, y) => {
    const c = Math.min(Math.max(x * k, 0), n - 1);
    const r = Math.min(Math.max(-y * k, 0), n - 1);
    const c0 = Math.floor(c), r0 = Math.floor(r);
    const c1 = Math.min(c0 + 1, n - 1), r1 = Math.min(r0 + 1, n - 1);
    const fc = c - c0, fr = r - r0;
    const h = (rr, cc) => heights[rr * n + cc];
    return (h(r0, c0) * (1 - fc) + h(r0, c1) * fc) * (1 - fr) + (h(r1, c0) * (1 - fc) + h(r1, c1) * fc) * fr;
  };
}

/** Which DEM level of detail to load: phones and small screens get the 256 grid, the rest 512. */
export function pickLod(lods, viewportW) {
  const want = viewportW < 700 ? 256 : 512;
  return lods.find((l) => l.width === want) || lods.find((l) => l.width === 256) || lods[0];
}

/** Device pixel ratio for the 3D canvas: capped lower on small screens (phone performance, brief 3c). */
export const pixelRatioFor = (dpr, viewportW) => Math.min(dpr || 1, viewportW < 700 ? 1.25 : 2);

export const EXAG_MIN = 1, EXAG_MAX = 3, EXAG_DEFAULT = 1.5;
export const clampExag = (v) => Math.min(EXAG_MAX, Math.max(EXAG_MIN, Number.isFinite(+v) ? +v : EXAG_DEFAULT));
export const exagLabel = (v) => `Vertical exaggeration ${clampExag(v).toFixed(1)}×`;

/**
 * Default 3D camera: looking at the area centre from the south-east, high enough to see the whole 1.5 km square.
 * aspect (view width / height, optional): narrow views (phones, a tall map area) step back so the square still fits.
 */
export function defaultCamera(extentM, aspect = 1.6) {
  const c = extentM / 2;
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1.6;
  const back = Math.min(2.2, Math.max(1, 1.45 / a));
  return { target: [c, 0, c], position: [c + extentM * 0.55 * back, extentM * 0.75 * back, c + extentM * 0.95 * back] };
}

/** Top-down camera that roughly matches the 2D map framing (start of the 0.5 s switch animation). */
export function topCamera(extentM) {
  const c = extentM / 2;
  return { target: [c, 0, c], position: [c, extentM * 1.25, c + 0.001] };
}

/** Smooth step 0..1 for the 0.5 s camera transition (ease in-out cubic). */
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Drop points closer than minStep metres (keeps the draped line light). Always keeps the last point. */
export function thin(coords, minStep = 4) {
  if (!coords?.length) return [];
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const p = out[out.length - 1], c = coords[i];
    if (Math.hypot(c[0] - p[0], c[1] - p[1]) >= minStep || i === coords.length - 1) out.push(c);
  }
  return out;
}

/** "rgb(r,g,b)" (route.js rampColor output) -> [r,g,b] 0..1 for vertex colours. */
export function rgbToUnit(css) {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(String(css));
  return m ? [m[1] / 255, m[2] / 255, m[3] / 255] : [1, 1, 1];
}

// ---- console look (15 Nov): relief tint, screen-space picking --------------------------------------------------

/** Relief tint, lowest ground -> highest ground. A display tint of the real DEM heights, NOT a surface colour. */
export const RELIEF_STOPS = ["#35100a", "#7a2814", "#b8451d", "#e07a3c", "#f3bd86"];
const hexToUnit = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const RELIEF_RGB = RELIEF_STOPS.map(hexToUnit);

/** t in 0..1 (0 = lowest height, 1 = highest) -> [r,g,b] 0..1 in sRGB. Clamps outside the range; NaN counts as 0. */
export function reliefColor(t) {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (RELIEF_RGB.length - 1);
  const i = Math.min(RELIEF_RGB.length - 2, Math.floor(u)), k = u - i;
  const a = RELIEF_RGB[i], b = RELIEF_RGB[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
/** CSS gradient with the same stops (for the legend bar). */
export const reliefCss = (dir = "to right") => `linear-gradient(${dir}, ${RELIEF_STOPS.join(", ")})`;

/** sRGB channel 0..1 -> linear 0..1 (three.js vertex colours are linear). */
export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Whole metres with a real minus sign, e.g. -2560.03 -> "−2560". */
export const wholeMetres = (z) => { const r = Math.round(z); return (r < 0 ? "−" : "") + Math.abs(r); };
/** Legend text for the relief tint. Both numbers come from terrain.meta.json (z_min, z_max); null if they are missing. */
export function heightLabel(zMin, zMax) {
  if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) return null;
  return { low: `${wholeMetres(zMin)} m`, high: `${wholeMetres(zMax)} m`, text: `Height ${wholeMetres(zMin)} m … ${wholeMetres(zMax)} m (HiRISE DTM)` };
}

/**
 * Projects n points (xyz flat array, world space) with a 4x4 view-projection matrix (16 numbers, column-major as in
 * three.js Matrix4.elements) to screen pixels. Writes x,y pairs into out (Float32Array(2n)); points behind the camera
 * or outside the depth range become NaN. Returns out.
 */
export function projectToScreen(xyz, m, w, h, out) {
  const n = Math.floor(xyz.length / 3);
  for (let i = 0; i < n; i++) {
    const x = xyz[i * 3], y = xyz[i * 3 + 1], z = xyz[i * 3 + 2];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    const cz = m[2] * x + m[6] * y + m[10] * z + m[14];
    if (!(cw > 0) || cz < -cw || cz > cw) { out[i * 2] = NaN; out[i * 2 + 1] = NaN; continue; }
    out[i * 2] = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw * 0.5 + 0.5) * w;
    out[i * 2 + 1] = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw * 0.5) * h;
  }
  return out;
}

/** Index of the screen point (x,y pairs) nearest to (px, py) within maxPx pixels, or -1. NaN points are skipped. */
export function nearestScreenPoint(xy, px, py, maxPx = 12) {
  let best = -1, bestD = maxPx * maxPx;
  for (let i = 0, n = xy.length / 2; i < n; i++) {
    const dx = xy[i * 2] - px, dy = xy[i * 2 + 1] - py, d = dx * dx + dy * dy;
    if (d <= bestD) { bestD = d; best = i; }   // NaN never passes
  }
  return best;
}

/** Distance in pixels from (px,py) to the segment a-b (for clicking a pin's stem). */
export function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** True when a pointer that went down at (x0,y0) and up at (x1,y1) counts as a click, not an orbit drag. */
export const isClick = (x0, y0, x1, y1, maxPx = 4) => Math.hypot(x1 - x0, y1 - y0) <= maxPx;
