// Written with AI assistance (Claude).
// Frame jezero-local-v1 helpers (JavaScript). The ONLY place these conversions live in JS.
// Canonical copy: pipeline/frame.js. Copies: display/src/frame.js (Kashif copies it), xr/src/frame.js.
// Never edit a copy; change pipeline/frame.js and re-copy. Spec: contracts/frame.md
//
// local  : x metres east of the NW corner, y metres north (negative going south), z elevation (m)
// eqc    : projection metres of the USGS DTM (Equirectangular, Mars sphere radius R from grid.json)
// grid   : row (0 = north edge), col (0 = west edge)
// lonlat : planetocentric degrees, east longitude
// three  : (x, z - z_ref, -y): Y up, -Z north
// leaflet: L.CRS.Simple [lat, lng] with overlay bounds [[0,0],[height,width]] in cells

const R_PATTERNS = [/(?:SPHEROID|ELLIPSOID)\["[^"]*",\s*([0-9.eE+]+)/, /\+R=([0-9.eE+]+)/];

export function radiusFromProjection(text) {
  for (const p of R_PATTERNS) {
    const m = text.match(p);
    if (m) return parseFloat(m[1]);
  }
  throw new Error("Mars radius not found in projection_wkt (expected SPHEROID[...] or +R=)");
}

export function makeFrame(grid) {
  const [x0, y0] = grid.origin_eqc;
  const cell = Number(grid.cell_m), width = grid.width, height = grid.height, zRef = Number(grid.z_ref);
  const R = radiusFromProjection(grid.projection_wkt);
  const deg = 180 / Math.PI;
  const f = {
    R, cell, width, height, zRef,
    localToEqc: (x, y) => [x0 + x, y0 + y],
    eqcToLocal: (xe, ye) => [xe - x0, ye - y0],
    eqcToLonLat: (xe, ye) => [(xe / R) * deg, (ye / R) * deg],
    lonLatToEqc: (lon, lat) => [R * lon / deg, R * lat / deg],
    localToGrid: (x, y) => [-y / cell, x / cell],        // [row, col], fractional
    gridToLocal: (row, col) => [col * cell, -row * cell], // [x, y]
    localToThree: (x, y, z) => [x, z - zRef, -y],
    localToLeaflet: (x, y) => [height + y / cell, x / cell], // [lat, lng] for L.latLng
    leafletBounds: () => [[0, 0], [height, width]],
  };
  f.localToLonLat = (x, y) => f.eqcToLonLat(...f.localToEqc(x, y));
  f.lonLatToLocal = (lon, lat) => f.eqcToLocal(...f.lonLatToEqc(lon, lat));
  f.inside = (x, y) => { const [r, c] = f.localToGrid(x, y); return r >= 0 && r < height && c >= 0 && c < width; };
  return f;
}

export async function loadFrame(url = "data/grid.json") {
  const grid = await fetch(url).then((r) => r.json());
  return makeFrame(grid);
}
