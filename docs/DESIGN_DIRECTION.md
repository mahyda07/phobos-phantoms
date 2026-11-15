# Marswalk design direction (run 2)

One product, two screens: the web map (`display/`) plans the walk, the headset (`xr/`) walks it. Both should feel like the same mission console.
Sources: the ui-ux-pro-max design system (style "Data-Dense Dashboard" + "Dark Mode (OLED)": we keep its accessibility and density rules but not its light navy palette), the taste-skill kit rules (one system, motion that answers the user, kind = software), and frontend-design's review against generic defaults. Contrast ratios below were computed with the WCAG formula (script output, 15 Nov 2026).

**Idea.** The figure everyone remembers is the **walk-back margin** (how many minutes you have left to turn back). It gets the boldest treatment in both apps: big mono numbers in the map HUD and on the visor, coloured by the route ramp. Everything around it stays quiet.

## Colour tokens (same names in both apps)
| token | value | use | contrast on `--bg` |
|---|---|---|---|
| `--bg` | `#06090f` | page / sky | n/a |
| `--panel` | `rgba(12,17,26,.78)` + `backdrop-filter: blur(12px)` | glass, **only on panels that float over the map or 3D view** | n/a |
| `--panel-solid` | `#0c111a` | side panel, help overlay, anything holding long text | n/a |
| `--text` | `#eef2f6` | body text | 17.72:1 |
| `--muted` | `#9aa8b6` | secondary text (7.79:1 on `--panel-solid`) | 8.21:1 |
| `--line` | `rgba(255,255,255,.10)` | borders, dividers | n/a |
| `--mars` / `--mars-2` | `#ff7a3d` / `#ffb26b` | primary actions, focus ring, active state, brand gradient | 7.69:1 / 11.23:1 |
| `--on-mars` | `#06090f` | text on orange buttons. White on orange is only 2.59:1 (fails), so the current CTA changes | 7.69:1 on `--mars` |
| `--ok` / `--warn` / `--danger` | `#5ee2a0` / `#f0aa28` / `#ff6b5e` | status text and icons. Text uses `#ff6b5e` (7.13:1), not the ramp red `#d73027` (4.12:1) | see left |

**Locked data scales (never restyle):**
- AI hazard: `rgba(255, floor(220·(1−h)), 30, min(1.6h,1)·200/255)`. This is the `model/hazard/infer.py` formula, already identical in `display/src/sources.js` `HAZARD_STOPS` and `xr/src/visor.js` `HAZARD_STOPS`. Its label is always "AI hazard estimate (validated on held-out terrain)".
- Margin ramp: red `#d73027` → amber `#f0aa28` → green `#2eaa50` (`display/src/route.js` `RAMP`).
- Home (return) route: `#7cc4ff`, a cool blue that clashes with neither scale.
- Ghost rover: `#e6e8eb` at 50 % opacity.

## Type
- **Host Grotesk** (UI and text) and **JetBrains Mono** (live numbers only: margin, time, slope, distance, hazard). Both OFL. Self-hosted as woff2 in each app's `public/fonts`, so the map still works offline. Fallback: `system-ui, "Segoe UI", sans-serif` / `ui-monospace, monospace`. Numbers use `font-variant-numeric: tabular-nums`.
- Scale (rem, 16 px base): 0.75 caption · 0.875 label · 1 body · 1.25 panel title · 1.75 HUD value · 2.5 hero number. Line-height 1.5 for body, 1.15 for numbers. Text is never smaller than 12 px; the visor is never smaller than 28 px at 1 m.
- Sentence case everywhere. No tracked ALL-CAPS eyebrows, and no "A · B · C" meta strings as decoration (the welcome kicker changes). Mono is never used for labels.

## Space, radius, layers
- Spacing (dense dashboard): 4 · 8 · 12 · 16 · 24 · 32 px (`--s1`…`--s6`).
- Radius by role, not one radius for everything: chip `999px`, control `8px`, card `12px`, floating panel `16px`. Map pins and the route have no radius.
- z-layers (above Leaflet's 1000 controls): map UI `1100` · HUD `1200` · panels `4900` · toast `5500` · help overlay `6000` · welcome `7000`.

## Components (one of each)
- **Panel**: glass when floating, solid when docked. 1 px `--line` border, 16 px padding, title at 1.25 rem.
- **Button pair**: primary = `--mars` fill with `--on-mars` text; secondary = transparent with a `--line` border. Both are at least 44 px tall. Hover: fill steps lighter (`--mars-2`) and lifts 2 px. Press: `scale(.98)`. Disabled: 40 % opacity, plus the reason on hover/focus.
- **Chip** (toggles, layer switches, the "?" hint): 32 px tall in a 44 px hit area; `aria-pressed` drives the "on" state, shown as orange outline + text.
- **Toast**: bottom-centre, solid panel, one line, auto-hides after 4 s (pauses on hover), `role="status"`. Errors say what failed and what to do; they never apologise.
- **Legend**: the gradient bar plus min/max labels and the source line. Uses the locked scales only.
- **Keyboard hint**: `<kbd>` with a `--line` border, mono 0.75 rem. The help overlay lists keyboard **and** controller bindings and closes with Esc or ?.
- **Focus**: a 2 px `--mars` outline with a 2 px offset on every interactive element. Never removed.

## Motion
- Durations: 120 ms (press/hover) · 200 ms (panels, toasts) · 500 ms (2D↔3D camera) · 600 ms (route draw-in). Easing: `cubic-bezier(.2,.8,.2,1)` going in; going out is faster (0.75× the time).
- Motion only answers an action or marks a new route/stop. Nothing fades in on scroll. No looping decoration except the starfield, which drifts below 1 px/s.
- `prefers-reduced-motion: reduce`: no draw-ins or camera flights (jump to the end state), the starfield is still, and toasts appear without sliding. In XR, the camera never moves without the user's own input.

## Headset specifics
Panels are world-locked (never head-locked). The visor uses the same tokens rendered to canvas: `--panel-solid` background, `--text`, and mono numbers. The return route, ghost rover and hazard colours match the map exactly. Haptics and voice clips follow the same rule as motion: they answer events, they rate-limit, and they can be muted.

## What Phase 6 changes (from the before screenshots, qa/run2/before/)
1. White text on the orange buttons → `--on-mars` (2.59:1 → 7.69:1).
2. The map's tracked ALL-CAPS panel titles ("ROUTE", "AT THIS POINT ON THE ROUTE") and the welcome kicker → sentence case.
3. The headset colours the route with a 3-step margin scale (`xr/src/terrain.js` `marginColour`: green ≥ 60 min, amber ≥ 15 min, red below). On this route every margin is ≥ 60 min, so it looks all green. The map uses a continuous ramp scaled to the route's largest margin → both use the map's `RAMP`, the same way.
4. Two apps, two token sets (`--muted`/`--mut`, `--accent`/`--mars`) → the names above in both apps.
5. Radii (3, 4, 5, 6, 8, 10, 12, 14, 16, 22, 24 px and 1 mm are in use) → the 4 role radii above.
