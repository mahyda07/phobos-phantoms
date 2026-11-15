# Sources and licences

Rule: nothing gets used until it has a row here with its licence. Non-NASA sources go in the second table.

## NASA and space-agency data
| Name | Used for | Link | Licence | Added by |
|---|---|---|---|---|
| USGS Mars 2020 TRN HiRISE DTM mosaic, 1 m (Jezero) | Elevation, slope, roughness, hologram | https://doi.org/10.5066/P9REJ9JN | CC0 1.0 Universal (checked 14 Nov 2026, see the AI-model row below) | Ramish |
| USGS Mars 2020 TRN HiRISE orthomosaic, 25 cm (Jezero) | Photo layer, hazard model input | https://doi.org/10.5066/P9QJDP48 · file: https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif | CC0 1.0 Universal (checked 14 Nov 2026, see the AI-model row below) | Ramish |
| Perseverance traverse and waypoints (Where is Perseverance?) | Proof check, rover path on map | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json · https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json | NASA/JPL-Caltech, public | Ramish |
| Mars Perseverance raw images | Stop-card photos on the web map: 5 Navcam images hotlinked, not copied (sols 405, 436, 709, 715, 716; IDs in display/src/stop-photos.json); credit NASA/JPL-Caltech | https://mars.nasa.gov/mars2020/multimedia/raw-images/ | NASA media guidelines | Kashif |
| Perseverance MEDA weather feed (mars.nasa.gov, JSON) | "Live NASA feeds" card on the web map: latest published daily min/max temperature and pressure at Jezero; feed last updated sol 1133 (2024-04-27), shown with its date. Fetched live in the visitor's browser at page load (30 min cache); endpoint checked 15 Nov 2026 | https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json&ver=1.0 | NASA data, public (credit NASA/JPL-Caltech) | Kashif |
| NASA CCMC DONKI space-weather notifications (api.nasa.gov) | "Live NASA feeds" card on the web map: last 30 days of space-weather notifications, context only (Sun/near-Earth activity, not conditions at Jezero). Fetched live in the visitor's browser at page load (30 min cache); endpoint checked 15 Nov 2026 | https://api.nasa.gov/ (DONKI notifications, public DEMO_KEY) | NASA data, public | Kashif |
| USGS Astrogeology Mars Viking Global Color Mosaic 925m (browse JPG, 1024×512, Simple Cylindrical, −180..180 E) | "Where on Mars?" locator inset on the web map: hotlinked, not copied | https://astrogeology.usgs.gov/search/map/mars_viking_global_color_mosaic_925m | Public domain (USGS product page: access constraints "public domain", use constraints "None"); originator NASA Planetary Data System | Kashif |
| Mars24 sunclock algorithm (NASA GISS; Allison & McEwen 2000, Planetary and Space Science 48, 215–235) | Sun height per hour at Jezero for the stand-in time window (pipeline/window_basic.py) | https://www.giss.nasa.gov/tools/mars24/help/algorithm.html | Published algorithm (NASA GISS), formulas re-implemented by us | Ramish |
| USGS Mars 2020 TRN HiRISE orthomosaic (25 cm) and DTM mosaic (1 m), the same two releases as above | AI hazard model (model/hazard/): a photo band of 7.5 km by 21.4 km around the walking area is the network input; hazard classes computed from the DTM are the training labels | https://doi.org/10.5066/P9QJDP48 · https://doi.org/10.5066/P9REJ9JN | CC0 1.0 Universal. The Rights field of both USGS data release pages reads "This work is marked with CC0 1.0 Universal" (checked 14 Nov 2026: https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-orthorectified-image-mosaic and https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic) | Maryam |
| WebXR Input Profiles assets (immersive-web/webxr-input-profiles, @webxr-input-profiles/assets 1.0.x) | Headset: high-fidelity controller models (Meta Quest Touch Plus profile) and articulated hand meshes (generic-hand), loaded at runtime by three.js XRControllerModelFactory / XRHandModelFactory | https://github.com/immersive-web/webxr-input-profiles · https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles | MIT License, Copyright (c) 2019 Amazon (packages/assets/LICENSE.md, checked 15 Nov 2026) | Ramish |

## Third-party data, models, libraries
| Name | Used for | Link | Licence | Added by |
|---|---|---|---|---|
| uv (Astral), Python 3.12 | Python tooling and environment | https://github.com/astral-sh/uv · https://www.python.org | uv: MIT or Apache-2.0; Python: PSF License | Ramish |
| NumPy, SciPy, scikit-image | Grids, least-cost routes (MCP), filters | https://numpy.org · https://scipy.org · https://scikit-image.org | BSD-3-Clause (all three) | Ramish |
| rasterio, pyproj | Reading the HiRISE GeoTIFFs, map projections | https://rasterio.readthedocs.io · https://pyproj4.github.io/pyproj/ | BSD-3-Clause; MIT | Ramish |
| FastAPI, uvicorn, jsonschema | Planner web service and contract checks | https://fastapi.tiangolo.com · https://github.com/encode/uvicorn · https://python-jsonschema.readthedocs.io | MIT; BSD-3-Clause; MIT | Ramish |
| three.js 0.187 | Headset 3D / WebXR | https://threejs.org | MIT | Ramish |
| Vite 8 | Build tool for xr/ | https://vitejs.dev | MIT | Ramish |
| PyTorch 2.11.0 (CUDA 12.8 build from download.pytorch.org) | Training and running the AI hazard network HazardNet (model/hazard/) on the RTX 5070 | https://pytorch.org · https://github.com/pytorch/pytorch/blob/main/LICENSE | BSD-3-Clause (checked 14 Nov 2026). The GPU build bundles NVIDIA CUDA libraries under NVIDIA's own licence terms (not reviewed line by line); they are used on the training PC only and nothing from them is in this repo | Maryam |
| Matplotlib, Pillow, requests | AI track figures (confusion matrix, examples, hazard previews) and the photo download in model/hazard/prepare_data.py | https://matplotlib.org/stable/project/license.html · https://github.com/python-pillow/Pillow/blob/main/LICENSE · https://pypi.org/project/requests/ | Matplotlib License (BSD-compatible, based on the PSF licence); MIT-CMU; Apache-2.0 (all checked 14 Nov 2026) | Maryam |
| HazardNet weights (our own; trained from scratch, no pre-trained weights) | AI hazard layer model/out/hazard.bin | Shared Drive folder model-checkpoints (file name and SHA-256 in model/MODEL_CARD.md) | Our own work, same licence as this repo | Maryam |
| Maryam's own earlier code | model/maryam/: walkability score (also the label rule of the AI model), time-window rule, reference route planner | Brought into this repo by Maryam; files and credit in model/maryam/ | Maryam's own code, brought into this repo by her | Maryam |

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
| Render (free web service) | Public planner web service | https://render.com | Render Terms of Service | Ramish |
