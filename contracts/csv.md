# CSV contracts (UTF-8, comma-separated, header row exactly as written)

## stops.csv (Mahida P4 → Ramish P2, Sat 11:00; P2 adds row and col)
`id,name,location_note,lat,lon_e,row,col,reason,science_value,source`
- `science_value` is 0–1.
- `lat`/`lon_e` are approximate, planetocentric, east longitude. `row`/`col` are filled by P2 on the grid.
- `reason` is one plain sentence. `source` is a URL or citation.

## conditions.csv (Mahida P4 → Maryam P1, Sat 18:00)
`ltst_hour,temp_c,pressure_pa,dust_tau,radiation_uGy_per_day,source,estimate`
- 24 rows, `ltst_hour` 0–23 (local true solar time).
- `estimate` is `yes` or `no`.
- Radiation borrowed from Curiosity RAD at Gale must say so in `source`.
- Label everything as climatology (typical conditions), never a forecast.

## Mineral layers (Mahida P4 → Ramish P2)
- GeoTIFF, one band, projection embedded, nodata set, native resolution, clipped to the download box (lat 18.40–18.52°N, lon 77.33–77.47°E).
- Classes: uint8 plus `legend.csv` with columns `value,mineral,source`. Values: float32.
- File name `science-minerals-<product>.tif`, in `science/out/`; sources in `science/sources.md`. Files over 50 MB go in the shared drive.
