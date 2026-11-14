// Written with AI assistance (Claude).
// Pure helpers for the hologram (no Three.js here, so they can be unit-tested in Node).

/** Bilinear height sampler over an n x n float32 grid (row 0 = north) spanning extentM metres. */
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

/** Colour for a walking-time margin in minutes: green (safe) -> amber -> red (no margin). Returns [r,g,b] 0..1. */
export function marginColour(m) {
  if (m == null || Number.isNaN(m)) return [0.6, 0.6, 0.6];
  if (m >= 60) return [0.2, 0.85, 0.35];
  if (m >= 15) return [1.0, 0.72, 0.1];
  return [0.95, 0.2, 0.15];
}

/** Hologram scale: metres of hologram per metre of Mars, for a model `sizeM` wide showing `extentM` of terrain. */
export const holoScale = (sizeM, extentM) => sizeM / extentM;
