// Written with AI assistance (Claude).
// Picks one real Perseverance raw image per science stop, reproducibly.
//   node display/scripts/find-stop-photos.mjs            -> prints the JSON to stdout (review, then save as display/src/stop-photos.json)
//   node display/scripts/find-stop-photos.mjs --check    -> also HEAD-checks every chosen image URL
// Method: stop lat/lon_e -> local metres (frame.js) -> nearest rover waypoint (terrain/out/rover_waypoints.csv) -> that sol's
// images from NASA's public raw-image JSON feed (neighbouring sols ±1..3 if none fit) -> first full-frame Navcam-left terrain view
// (prefer the upper full-resolution tile of a colour look 20-40 deg down: ground to the horizon, no rover deck), else Mastcam-Z / front Hazcam. Nothing is downloaded into the repo.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeFrame } from "../src/frame.js";
import { stopsFromCsv } from "../src/stop-cards.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const FEED = "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol=";
const CREDIT = "NASA/JPL-Caltech";

const f = makeFrame(JSON.parse(readFileSync(join(repo, "terrain/out/grid.json"), "utf8")));
const stops = stopsFromCsv(readFileSync(join(repo, "science/stops.csv"), "utf8"), f);
const wpLines = readFileSync(join(repo, "terrain/out/rover_waypoints.csv"), "utf8").trim().split(/\r?\n/);
const head = wpLines[0].split(",");
const waypoints = wpLines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], Number(v)])));

const num = (s) => Number(String(s ?? "").replace(/[()]/g, ""));
const dims = (s) => String(s ?? "").replace(/[()]/g, "").split(",").map(Number);

// Rank one feed image: lower is better; null = not usable.
function rank(img) {
  const cam = img.camera?.instrument || "";
  const el = num(img.extended?.mastEl);
  const [w, h] = dims(img.extended?.dimension);
  const url = img.image_files?.large || img.image_files?.medium;
  if (img.sample_type !== "Full" || !url || !/\.jpg$/i.test(url)) return null;
  if (cam === "NAVCAM_LEFT" || cam === "NAVCAM_RIGHT") {
    // Navcam frames are 5120x3840; the feed has full frames (scaled down) and full-resolution quarter tiles.
    // Best view of terrain: the UPPER tile of a look ~20-40 deg down (ground out to the horizon, no rover deck),
    // then a full frame (which usually shows some deck at the bottom). Colour (N?F_) before greyscale.
    if (!(w >= 1280 && h >= 960) || !(el <= -3 && el >= -40)) return null;
    const [, sy, sw] = dims(img.extended?.subframeRect);
    const colour = /^N[LR]F_/.test(img.imageid) ? 0 : 0.2;
    const left = cam === "NAVCAM_LEFT" ? 0 : 0.1;
    if (sw >= 5000) return 1 + colour + left;                      // full frame
    // upper tile of a downward look; among those prefer looking straight ahead (sideways looks catch the arm and mast)
    if (sy === 1 && el <= -20) return 0 + colour + left + Math.abs(num(img.extended?.mastAz)) / 1000;
    return 4 + colour + left;                                      // other tiles (sky-heavy or deck-heavy)
  }
  if (cam === "MCZ_LEFT" || cam === "MCZ_RIGHT") {
    // full-frame terrain only; the calibration target sits far below the horizon (el << -40), so skip steep looks
    if (!(w >= 1600 && h >= 1200) || !(el <= -2 && el >= -30)) return null;
    return 2;
  }
  if (cam.startsWith("FRONT_HAZCAM")) return w >= 1280 ? 5 : null;
  return null;
}

async function feed(sol) {
  const r = await fetch(FEED + sol);
  if (!r.ok) throw new Error(`feed sol ${sol}: HTTP ${r.status}`);
  return (await r.json()).images || [];
}

async function pick(sol) {
  for (const d of [0, 1, -1, 2, -2, 3, -3]) {
    const imgs = await feed(sol + d);
    const ok = imgs.map((img) => ({ img, r: rank(img) })).filter((e) => e.r != null);
    if (!ok.length) continue;
    ok.sort((a, b) => a.r - b.r || String(a.img.date_taken_utc).localeCompare(String(b.img.date_taken_utc)));
    return ok[0].img;
  }
  return null;
}

const photos = {};
for (const s of stops) {
  let best = null;
  for (const w of waypoints) {
    const d = Math.hypot(w.x - s.x, w.y - s.y);
    if (!best || d < best.d) best = { w, d };
  }
  const img = await pick(best.w.sol);
  if (!img) { console.error(`${s.id}: no usable image near sol ${best.w.sol}; left out`); continue; }
  const dist = Math.round(best.d);
  photos[s.id] = {
    stop_id: s.id,
    sol: img.sol,
    nearest_waypoint_sol: best.w.sol,
    nearest_waypoint_distance_m: dist,
    image_id: img.imageid,
    camera: img.camera.instrument,
    date_taken: img.date_taken_utc || null,
    image_url: img.image_files.large || img.image_files.medium,
    full_res_url: img.image_files.full_res || null,
    page_url: img.link || null,
    credit: CREDIT,
    note: `Taken on sol ${img.sol}${img.sol !== best.w.sol ? ` (nearest waypoint is sol ${best.w.sol})` : ""} near the rover's position ~${dist} m from this stop; shows the kind of terrain nearby, not the exact stop.`,
  };
}

if (process.argv.includes("--check")) {
  for (const p of Object.values(photos)) {
    const r = await fetch(p.image_url, { method: "HEAD" });
    console.error(`${p.stop_id} ${r.status} ${r.headers.get("content-type")} ${p.image_url}`);
  }
}

console.log(JSON.stringify({
  _note: "One real Perseverance raw image per science stop, picked by display/scripts/find-stop-photos.mjs: stop lat/lon_e -> local metres "
    + "(frame.js) -> nearest rover waypoint in terrain/out/rover_waypoints.csv -> that sol's images in NASA's public raw-image feed "
    + "(https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol=N), Navcam terrain view (colour; the upper full-resolution tile of a look 20-40 deg down is preferred because it shows ground to the horizon without the rover deck). "
    + "Images are hotlinked, not copied. They show terrain near the rover's position that sol, not the exact stop. Credit NASA/JPL-Caltech.",
  photos,
}, null, 2));
