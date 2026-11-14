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

## Science data (Mahida, science/)
| Name | Used for | Link | Licence | Added by |
|---|---|---|---|---|
| CRISM MTRDR browse products, FRT000047A3 (MRO) | Mineral layers and science stops | https://ode.rsl.wustl.edu/mars | NASA PDS, public | Mahida |
| Mars 2020 MEDA derived pressure and calibrated air temperature, sols 500 and 501 | conditions.csv temperature and pressure | https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/ | NASA PDS, public | Mahida |
| Savijarvi et al. 2024, Wintertime column modeling in Jezero crater, Mars: Period of near-fog and a dust event, Icarus 421 (check article number) | Dust opacity about 0.5 on sols 566 to 571 | https://doi.org/10.17189/1522849 is the MEDA dataset they used | Published paper, one value cited | Mahida |
| Hassler et al. 2014, Mars surface radiation environment measured with Curiosity, Science (check volume) | Radiation 0.210 mGy/day, measured at Gale, not Jezero | (journal) | Published paper, one value cited | Mahida |
