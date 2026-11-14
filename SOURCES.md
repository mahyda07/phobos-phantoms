# Sources and licences

Rule: nothing gets used until it has a row here with its licence. Non-NASA sources go in the second table.

## NASA and space-agency data
| Name | Used for | Link | Licence | Added by |
|---|---|---|---|---|
| USGS Mars 2020 TRN HiRISE DTM mosaic, 1 m (Jezero) | Elevation, slope, roughness, hologram | https://doi.org/10.5066/P9REJ9JN | CC0 (per USGS data release) — confirm | Ramish |
| USGS Mars 2020 TRN HiRISE orthomosaic, 25 cm (Jezero) | Photo layer, hazard model input | https://doi.org/10.5066/P9QJDP48 · file: https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif | USGS data release (public domain) — confirm | Ramish |
| Perseverance traverse and waypoints (Where is Perseverance?) | Proof check, rover path on map | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json · https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json | NASA/JPL-Caltech, public | Ramish |
| Mars Perseverance raw images | Stop-card photos on the web map: 5 Navcam images hotlinked, not copied (sols 405, 436, 709, 715, 716; IDs in display/src/stop-photos.json); credit NASA/JPL-Caltech | https://mars.nasa.gov/mars2020/multimedia/raw-images/ | NASA media guidelines | Kashif |
| Mars24 sunclock algorithm (NASA GISS; Allison & McEwen 2000, Planetary and Space Science 48, 215–235) | Sun height per hour at Jezero for the stand-in time window (pipeline/window_basic.py) | https://www.giss.nasa.gov/tools/mars24/help/algorithm.html | Published algorithm (NASA GISS), formulas re-implemented by us | Ramish |

## Third-party data, models, libraries
| Name | Used for | Link | Licence | Added by |
|---|---|---|---|---|
| uv (Astral), Python 3.12 | Python tooling and environment | https://github.com/astral-sh/uv · https://www.python.org | uv: MIT or Apache-2.0; Python: PSF License | Ramish |
| NumPy, SciPy, scikit-image | Grids, least-cost routes (MCP), filters | https://numpy.org · https://scipy.org · https://scikit-image.org | BSD-3-Clause (all three) | Ramish |
| rasterio, pyproj | Reading the HiRISE GeoTIFFs, map projections | https://rasterio.readthedocs.io · https://pyproj4.github.io | BSD-3-Clause; MIT | Ramish |
| FastAPI, uvicorn, jsonschema | Planner web service and contract checks | https://fastapi.tiangolo.com · https://www.uvicorn.org · https://python-jsonschema.readthedocs.io | MIT; BSD-3-Clause; MIT | Ramish |
| Gradio 5.50, Hugging Face `spaces` | Planner service page and start-up on Hugging Face Spaces (ZeroGPU) | https://gradio.app · https://pypi.org/project/spaces/ | Apache-2.0; Apache-2.0 | Ramish |
| three.js 0.187 | Headset 3D / WebXR | https://threejs.org | MIT | Ramish |
| Vite 8 | Build tool for xr/ | https://vitejs.dev | MIT | Ramish |

## Science data (Mahida, science/)
| Name | Used for | Link | Licence | Added by |
|---|---|---|---|---|
| CRISM MTRDR browse products, FRT000047A3 (MRO) | Mineral layers and science stops | https://ode.rsl.wustl.edu/mars | NASA PDS, public | Mahida |
| Mars 2020 MEDA derived pressure and calibrated air temperature, sols 500 and 501 | conditions.csv temperature and pressure | https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/ | NASA PDS, public | Mahida |
| Savijarvi et al. 2024, Wintertime column modeling in Jezero crater, Mars: Period of near-fog and a dust event, Icarus 421, 116242, https://doi.org/10.1016/j.icarus.2024.116242 | Dust opacity about 0.5 on sols 566 to 571 | https://doi.org/10.17189/1522849 is the MEDA dataset they used | Published paper, one value cited | Mahida |
| Hassler et al. 2014, Mars surface radiation environment measured with Curiosity, Science 343 (6169), 1244797, https://doi.org/10.1126/science.1244797 | Radiation 0.210 mGy/day, measured at Gale, not Jezero | (journal) | Published paper, one value cited | Mahida |
| Leaflet 1.9.4 | Web map (display/) | https://leafletjs.com | BSD-2-Clause | Kashif |
| Vite 8 | Build tool for display/ | https://vitejs.dev | MIT | Kashif |

## Hosting (services, no data)
| Name | Used for | Link | Terms | Added by |
|---|---|---|---|---|
| Vercel (Hobby) | Public links for the headset app and the web map | https://vercel.com | Vercel Terms of Service | Ramish |
| Hugging Face Spaces | Public planner web service | https://huggingface.co/spaces | Hugging Face Terms of Service | Ramish |
