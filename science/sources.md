# Science sources (Mahida)

One row per file in `science/out/`. No licence = we can't use it.

| File | Dataset / product ID | Link | Licence | Notes |
|---|---|---|---|---|
| science-minerals-FRT000047A3-CAR.tif | CRISM MTRDR frt000047a3_07_brcr2j_mtr3 (Version 2 Carbonates browse), MRO | https://ode.rsl.wustl.edu/mars | NASA PDS, public | Relative signal strength 0 to 1 (browse image stretched to 0-254, divided by 254). Bands MIN2295_2480 and MIN2345_2537, strongest of the two. Clipped to the download box |
| science-minerals-FRT000047A3-CLAY.tif | CRISM MTRDR frt000047a3_07_brpfmj_mtr3 (Phyllosilicate with Fe and Mg browse), MRO | https://ode.rsl.wustl.edu/mars | NASA PDS, public | Relative signal strength 0 to 1. Band BD2355. Weak in the walking area |
| science-minerals-FRT000047A3-OLV.tif | CRISM MTRDR frt000047a3_07_brmafj_mtr3 (Mafic Mineralogy browse), MRO | https://ode.rsl.wustl.edu/mars | NASA PDS, public | Relative olivine index 0 to 1. Band OLINDEX3 |
| stops.csv | Derived from the three layers above | https://ode.rsl.wustl.edu/mars | NASA PDS, public | 5 stops. Score is the equal-weight mean of the three layers, smoothed over 3 pixels |
| conditions.csv | Perseverance MEDA pressure (derived) and air temperature (calibrated), sols 500 and 501 | https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/ | NASA PDS, public | Dust and radiation values are cited from papers, see SOURCES.md |
