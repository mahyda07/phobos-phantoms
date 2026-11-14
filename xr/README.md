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

## Data
`scripts/copy-data.mjs` copies from `terrain/out/`: `grid.json`, `terrain.meta.json`, `dem_lod512.bin`, `dem_lod256.bin`, `photo_2k.jpg` (falls back to `photo.png`), `slope.png`, `rover_path.json`, and a planner `route.json` if one exists (`model/out/route.json` or `pipeline/fallback/route.json`). Without a planner route it shows Perseverance's real path, labelled as a stand-in.

## Deploy (Vercel, Ramish's account)
```
npm run build
npx vercel deploy dist --prod
```
