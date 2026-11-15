# 30-second video script (with `subtitles.srt`)

Total 30 s. Every number comes from a repo file (sources in brackets).

| Time | Picture | Words (= subtitle) |
|---|---|---|
| 0–4 s | Web map welcome screen (https://phobos-display.vercel.app) | Marswalk: a safety map for a walk on Jezero Crater, Mars. |
| 4–9 s | Map with the HiRISE photo, then the slope layer | Real NASA terrain, 1.5 by 1.5 km, on a 2-metre grid. [`terrain/out/grid.json`] |
| 9–14.5 s | Turn on "AI hazard estimate (validated on held-out terrain)"; route appears | An AI hazard estimate and a planner find a 4.4 km route through five science stops. [`model/out/route.json`: 4383.4 m, 5 stops] |
| 14.5–19.5 s | Press Play: route coloured by walk-back margin | At every step: time left to walk back. The smallest margin is 136 minutes. [`model/out/route.json`: 136.1 min] |
| 19.5–24.5 s | Proof view table | Checked against Perseverance's real path: our planner stays closer than a straight line. [`model/out/results.md`: median 16.0 m vs 20.0 m] |
| 24.5–29 s (1 s end card) | Quest 3: hologram on a desk, then Step in with the visor | Put it on your desk in a Quest 3, then step in and walk it. |

Keep the on-screen hazard wording "AI hazard estimate (validated on held-out terrain)".
