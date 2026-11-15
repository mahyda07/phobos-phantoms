// Written with AI assistance (Claude).
// "Where on Mars?" locator inset: a small global Mars map (bottom-left, above the scale bar) with a pulsing dot
// at the walking area.
// RULE: nothing here is invented.
//   - Position: centre of grid.json box_latlon (planetocentric, east longitude). The size in the caption is
//     grid.json width x height x cell_m. No coordinates are written into this file.
//   - Image: hotlinked (not copied into the repo) USGS Astrogeology browse JPG of the Mars Viking Global Color
//     Mosaic 925m, 1024 x 512 px, Simple Cylindrical, planetocentric, positive east, longitude domain -180..180
//     (product page "Longitude Domain: -180 to 180"; checked by eye: Olympus Mons / Hellas / Syrtis Major sit
//     where that convention puts them). Access constraints on the product page: public domain.
//
// locator.css is NOT imported here (keeps `node --test` DOM-free); main.js imports it.
// Leaflet is passed in by the caller ({ L }), so this module never imports it.

export const MARS_GLOBAL = {
  url: "https://astrogeology.usgs.gov/ckan/dataset/dfdc2242-52dc-4126-bc89-03af8253ae79/resource/0d7b31dc-0b2e-4ca6-89dc-e3c1404c0232/download/mars_viking_clrmosaic_global_1024.jpg",
  name: "Mars Viking Global Color Mosaic 925m (browse image)",
  credit: "Viking Orbiter colour mosaic (NASA Planetary Data System) via USGS Astrogeology, public domain",
  source: "https://astrogeology.usgs.gov/search/map/mars_viking_global_color_mosaic_925m",
  licence: "Public domain (USGS Astrogeology product page: access constraints \"public domain\", use constraints \"None\")",
  lonConvention: "-180-180",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Equirectangular image -> percent position of (lonE, lat). Longitude wraps into [0, 100) %; the antimeridian
// (west edge = east edge) is reported as 0 %. Latitude is clamped to [-90, 90].
export function lonLatToPercent(lonE, lat, convention = "-180-180") {
  if (convention !== "-180-180" && convention !== "0-360") throw new Error(`unknown longitude convention: ${convention}`);
  const west = convention === "0-360" ? 0 : -180;
  const dx = (((Number(lonE) - west) % 360) + 360) % 360;
  const la = Math.max(-90, Math.min(90, Number(lat)));
  return { x: (dx / 360) * 100, y: ((90 - la) / 180) * 100 };
}

// Centre of grid.json box_latlon (mean of min/max; fine for display at this scale). null if values are missing.
export function boxCentre(boxLatLon) {
  const b = boxLatLon || {};
  const v = [b.lat_min, b.lat_max, b.lon_min_e, b.lon_max_e].map(Number);
  if (b.lat_min == null || b.lat_max == null || b.lon_min_e == null || b.lon_max_e == null || !v.every(Number.isFinite)) return null;
  return { lat: (v[0] + v[1]) / 2, lonE: (v[2] + v[3]) / 2 };
}

const fmtLat = (lat) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
const fmtLon = (lonE) => {
  const l = ((((lonE + 180) % 360) + 360) % 360) - 180; // show as -180..180, E/W
  return `${Math.abs(l).toFixed(2)}°${l >= 0 ? "E" : "W"}`;
};
const fmtKm = (m) => `${+(m / 1000).toFixed(2)}`;

// Caption text from grid.json: { title, size } or null when grid has no usable box_latlon.
export function locatorLabel(grid) {
  const c = boxCentre(grid?.box_latlon);
  if (!c) return null;
  const title = `Jezero Crater · walking area ${fmtLat(c.lat)}, ${fmtLon(c.lonE)}`;
  const w = Number(grid.width) * Number(grid.cell_m), h = Number(grid.height) * Number(grid.cell_m);
  const size = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
    ? `(${fmtKm(w)} × ${fmtKm(h)} km, far too small to see at this scale)`
    : "(far too small to see at this scale)";
  return { title, size };
}

export function initLocator(map, { L, grid, isSample } = {}) {
  const noop = { destroy() {} };
  if (!map || !L || isSample) return noop;
  const c = boxCentre(grid?.box_latlon);
  const label = locatorLabel(grid);
  if (!c || !label) return noop;
  const p = lonLatToPercent(c.lonE, c.lat, MARS_GLOBAL.lonConvention);

  let control = null;
  let div = null;
  const Locator = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd() {
      div = L.DomUtil.create("div", "locator-control");
      div.innerHTML = `
        <div class="locator-head">Where on Mars?</div>
        <div class="locator-caption">${esc(label.title)}<br><span class="locator-size">${esc(label.size)}</span></div>
        <div class="locator-frame" role="button" tabindex="0" aria-pressed="false"
             title="Click to enlarge / shrink" aria-label="Global map of Mars with the walking area marked. Click to enlarge.">
          <img class="locator-img" src="${esc(MARS_GLOBAL.url)}" alt="Global map of Mars (Viking colour mosaic)"
               loading="lazy" decoding="async" referrerpolicy="no-referrer" width="1024" height="512">
          <span class="locator-dot" style="left:${p.x.toFixed(3)}%;top:${p.y.toFixed(3)}%" aria-hidden="true"></span>
        </div>
        <div class="locator-credit"><a href="${esc(MARS_GLOBAL.source)}" target="_blank" rel="noopener">${esc(MARS_GLOBAL.credit)}</a></div>`;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      const frame = div.querySelector(".locator-frame");
      const img = div.querySelector(".locator-img");
      const toggle = () => {
        const big = div.classList.toggle("locator-large");
        frame.setAttribute("aria-pressed", String(big));
      };
      frame.addEventListener("click", toggle);
      frame.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
      // No broken image: hide the whole inset if the hotlinked JPG does not load.
      img.addEventListener("error", () => { if (div) div.style.display = "none"; });
      return div;
    },
  });
  control = new Locator().addTo(map); // bottom corners stack later controls above earlier ones (scale bar)
  return {
    destroy() {
      if (control) control.remove();
      control = null;
      div = null;
    },
  };
}
