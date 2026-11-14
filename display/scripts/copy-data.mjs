// Written with AI assistance (Claude).
// Copies ONE whole data set into display/public/data/ (never a mix of sets).
//   node scripts/copy-data.mjs                 -> real set from terrain/out/ (+ route.json if one exists)
//   node scripts/copy-data.mjs --set samples   -> every file in samples/out/ (synthetic, marked SAMPLE)
// public/data is emptied first so files from the other set can't linger. Never edit public/data by hand.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const out = join(here, "..", "public", "data");

const args = process.argv.slice(2);
const i = args.indexOf("--set");
const set = i >= 0 ? args[i + 1] : "real";
if (set !== "real" && set !== "samples") {
  console.error(`unknown set "${set}" (use "real" or "samples")`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copied = [];
const missing = [];
const copy = (src, name) => { copyFileSync(src, join(out, name)); copied.push(name); };

if (set === "samples") {
  const dir = join(repo, "samples", "out");
  for (const f of readdirSync(dir)) {
    if (statSync(join(dir, f)).isFile()) copy(join(dir, f), f);
  }
  console.log(`data set: SAMPLES (synthetic, not NASA data) from samples/out/`);
} else {
  const dir = join(repo, "terrain", "out");
  const required = ["grid.json", "terrain.meta.json", "layers.manifest.json", "photo.png", "slope.png", "rough.png", "dem.png", "rover_path.json", "rover_waypoints.csv"];
  const optional = ["hazard.png", "science.png", "hazard.meta.json", "stops.csv", "window.json"];
  for (const f of [...required, ...optional]) {
    const src = join(dir, f);
    if (existsSync(src)) copy(src, f);
    else missing.push((required.includes(f) ? "" : "(optional) ") + "terrain/out/" + f);
  }
  // Files from other tracks: first existing candidate wins. Locations not yet confirmed are listed as candidates.
  const firstOf = (name, candidates) => {
    const src = candidates.map((c) => join(repo, ...c.split("/"))).find((p) => existsSync(p));
    if (src) { copy(src, name); console.log(`${name} from ${src.slice(repo.length + 1)}`); }
    else missing.push(`(optional) ${name} (${candidates.join(", ")})`);
  };
  firstOf("route.json", ["model/out/route.json", "pipeline/fallback/route.json"]);
  if (!copied.includes("window.json")) firstOf("window.json", ["model/out/window.json", "pipeline/fallback/window.json"]);
  firstOf("results.md", ["model/out/results.md", "model/results.md", "results.md"]);
  // Stops: Ramish's grid copy (with row/col) wins; until it exists use Mahida's science/stops.csv (lat/lon only).
  if (!copied.includes("stops.csv")) firstOf("stops.csv", ["science/stops.csv"]);
  firstOf("conditions.csv", ["terrain/out/conditions.csv", "science/conditions.csv"]);
  console.log(`data set: REAL from terrain/out/`);
}

console.log(`copied ${copied.length} file(s) to display/public/data/: ${copied.join(", ")}`);
for (const m of missing) console.warn("MISSING " + m);
if (missing.some((m) => !m.startsWith("(optional)"))) console.warn("required terrain file(s) missing — run terrain/build_terrain.py first");
