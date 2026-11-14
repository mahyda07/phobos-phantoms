# Sources and licences

Rule: nothing gets used until it has a row here with its licence. Non-NASA sources go in the second table.

## NASA and space-agency data
| Name | Used for | Link | Licence | Added by |
|---|---|---|---|---|
| USGS Mars 2020 TRN HiRISE DTM mosaic, 1 m (Jezero) | Elevation, slope, roughness, hologram | https://doi.org/10.5066/P9REJ9JN | CC0 (per USGS data release) — confirm | Ramish |
| USGS Mars 2020 TRN HiRISE orthomosaic, 25 cm (Jezero) | Photo layer, hazard model input | https://doi.org/10.5066/P9QJDP48 · file: https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif | USGS data release (public domain) — confirm | Ramish |
| NASA JPL Mars Trek | Cross-check of site, visuals | https://trek.nasa.gov/mars/ | to check | |
| USGS–NASA Planetary Geologic Mapping (Jezero map SIM 3464) | Science stops | https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars | to check | |
| Perseverance traverse and waypoints (Where is Perseverance?) | Proof check, rover path on map | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json · https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json | NASA/JPL-Caltech, public | Ramish |
| Mars Perseverance raw images | Stop-card photos (credit NASA/JPL-Caltech) | https://mars.nasa.gov/mars2020/multimedia/raw-images/ | NASA media guidelines | |

## Third-party data, models, libraries
| Name | Used for | Link | Licence | Added by |
|---|---|---|---|---|
| uv, Python 3.12, NumPy, SciPy, scikit-image, rasterio, pyproj, FastAPI, uvicorn, jsonschema | Tooling | (PyPI) | various open source — list each before release | Ramish |
| three.js 0.187 | Headset 3D / WebXR | https://threejs.org | MIT | Ramish |
| Vite 8 | Build tool for xr/ | https://vitejs.dev | MIT | Ramish |
| Leaflet 1.9.4 | Web map (display/) | https://leafletjs.com | BSD-2-Clause | Kashif |
| Vite 8 | Build tool for display/ | https://vitejs.dev | MIT | Kashif |
