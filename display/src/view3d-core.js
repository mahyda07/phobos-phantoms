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

/** Default 3D camera: looking at the area centre from the south-east, high enough to see the whole 1.5 km square. */
export function defaultCamera(extentM) {
  const c = extentM / 2;
  return { target: [c, 0, c], position: [c + extentM * 0.55, extentM * 0.75, c + extentM * 0.95] };
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
