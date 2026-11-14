// Written with AI assistance (Claude).
// Copies the files the headset needs from terrain/out/ (and a real route if one exists) into xr/public/data/.
// Never edit public/data by hand; it is rebuilt on every `npm run dev` / `npm run build`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const out = join(here, "..", "public", "data");
mkdirSync(out, { recursive: true });

const need = ["grid.json", "terrain.meta.json", "dem_lod512.bin", "dem_lod256.bin", "photo_2k.jpg", "photo.png", "slope.png", "rover_path.json"];
let missing = 0;
for (const f of need) {
  const src = join(repo, "terrain", "out", f);
  if (existsSync(src)) { copyFileSync(src, join(out, f)); console.log("copied terrain/out/" + f); }
  else { console.warn("MISSING terrain/out/" + f); missing++; }
}
// Real planned route (Maryam / planner service output) if present; otherwise the app shows Perseverance's path.
for (const cand of [join(repo, "model", "out", "route.json"), join(repo, "pipeline", "fallback", "route.json")]) {
  if (existsSync(cand)) { copyFileSync(cand, join(out, "route.json")); console.log("copied route from " + cand); break; }
}
if (missing) console.warn(`${missing} terrain file(s) missing — run terrain/build_terrain.py first`);
