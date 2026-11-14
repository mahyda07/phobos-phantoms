# xr

**Owner:** Ramish (mixed-reality track, commits tagged [P5])

Quest 3 WebXR app (Vite + Three.js): the real Jezero walking area as a hologram on your desk in colour passthrough.

## Run on the PC (desktop preview)
```
cd xr
npm install
npm run dev        # copies terrain/out/* into public/data, serves http://127.0.0.1:5173
```
## Run on the Quest over USB
```
adb reverse tcp:5173 tcp:5173
```
Quest Browser → `http://localhost:5173` → **Enter mixed reality**. `?lod=256` uses the lighter mesh.

## Controls
- Look at your desk until the white ring appears → **pinch** (or controller trigger) to place. No table found in 5 s → placed 0.6 m in front of you.
- **Pinch and drag** near the model = move. **Pinch with both hands** and pull apart = scale (0.25× – 4×).
- Buttons in front of the model: **⟲ 15° / ⟳ 15°** rotate, **Height ×1/×2/×4**, **Photo/Slope** layer, **Re-place**.

## Step-in walk + visor (PLAN D26)
- **Step in** (last button on the desk panel, or "Step in / out" on the PC) turns the hologram into the real terrain at **1:1** around you, with a Mars sky and haze, and walks the planned route from the start.
- The ground ribbon is the route coloured by walk-back margin; the tall orange beacons are the science stops.
- **Visor** (Kashif's design v1, `display/visor/`): walk-back margin (whole minutes, rounded down), time out, slope here, AI hazard here ("model, not validated"), next stop, sun height. Values come straight from `route.json` `per_vertex` at the current route point; sun height from `window.json` once Maryam publishes it (shows "—" until then). Neutral white until colour thresholds are published in `docs/cost-model.md`. "STAND-IN ROUTE" badge while the route id starts with `standin-`.
- Walk panel at waist height: **Pause/Play**, **Speed 10× / 30× / 60×** (simulated walking minutes per real minute; 30× walks the 77 min route in about 2.6 min), **Restart**, **Step out**.
- How the visor picks its values (answers to the open questions in `display/visor/README.md`):
  1. Current point = a simulated walk along `per_vertex.t_min` (not the walker's real position).
  2. Next stop = the first stop (in `properties.stops` order) whose nearest route point comes after the current point.
  3. LTST hour = `window.json` `eva_window.start_ltst` + time out (converted to Mars hours), then the hourly `sun_elev_deg`.
- Logic is in `src/walk.js` (tested in `src/walk.test.mjs`, `npm test`); drawing in `src/visor.js`.

## Data
`scripts/copy-data.mjs` copies from `terrain/out/`: `grid.json`, `terrain.meta.json`, `dem_lod512.bin`, `dem_lod256.bin`, `photo_2k.jpg` (falls back to `photo.png`), `slope.png`, `rover_path.json`, a planner `route.json` if one exists (`model/out/route.json` or `pipeline/fallback/route.json`), and `window.json` if one exists (`model/out/window.json` or `pipeline/fallback/window.json`). Without a planner route it shows Perseverance's real path, labelled as a stand-in.

## Deploy (Vercel, Ramish's account)
Deploy from a copy **outside the git repo**: Vercel blocks deploys whose newest commit author is the GitHub no-reply address.
```
npm run build
robocopy F:\SpaceApps2026\phobos-phantoms\xr\dist F:\SpaceApps2026\deploy\xr /MIR /XD .vercel /NFL /NDL /NJH /NP
cd F:\SpaceApps2026\deploy\xr
npx vercel deploy . --prod
```
