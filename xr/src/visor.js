// Written with AI assistance (Claude).
// Visor HUD drawn on a 1600 x 900 canvas, laid out after Kashif's visor design v1 (display/visor/).
// Centre band stays clear so the walker sees the terrain. All values are neutral white: no colour
// thresholds are published yet in docs/cost-model.md. Track [P5].
export const VISOR_W = 1600, VISOR_H = 900;
// run 2: colours from docs/DESIGN_DIRECTION.md tokens (panel-solid, line, text, muted, mars)
const C = { panel: "rgba(12,17,26,0.84)", edge: "rgba(255,255,255,0.16)", label: "#9aa8b6", value: "#eef2f6", muted: "#9aa8b6", badge: "#ffb26b" };
const FONT = "'Host Grotesk', system-ui, 'DejaVu Sans', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'DejaVu Sans Mono', monospace";
// Same margin ramp as the web map (display/src/route.js RAMP + rampColor): red (0) -> amber -> green (largest margin).
const RAMP = [[215, 48, 39], [240, 170, 40], [46, 170, 80]];
export function rampColor(t) {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const [a, b, k] = u < 0.5 ? [RAMP[0], RAMP[1], u / 0.5] : [RAMP[1], RAMP[2], (u - 0.5) / 0.5];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function panel(g, x, y, w, h) {
  roundRect(g, x, y, w, h, 28); g.fillStyle = C.panel; g.fill();
  g.lineWidth = 2; g.strokeStyle = C.edge; g.stroke();
}
function field(g, { x, y, w, h, label, sub, value, unit, big, accent }) {
  panel(g, x, y, w, h);
  g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.fillStyle = C.label; g.font = `600 30px ${FONT}`; g.fillText(label, x + 26, y + 48);
  let vy = y + 48;
  if (sub) { g.fillStyle = C.muted; g.font = `22px ${FONT}`; g.fillText(sub, x + 26, y + 80); vy = y + 80; }
  const vs = big ? 140 : 72;
  g.fillStyle = C.value; g.font = `700 ${vs}px ${MONO}`;
  if (accent) { g.fillStyle = accent; g.fillRect(x, y + 22, 6, h - 44); g.fillStyle = C.value; }
  const baseline = vy + (big ? 140 : 78);
  g.fillText(value, x + 26, baseline);
  if (unit) {
    const vw = g.measureText(value).width;
    g.fillStyle = C.label; g.font = `600 ${big ? 40 : 30}px ${FONT}`; g.fillText(unit, x + 26 + vw + 12, baseline);
  }
}

// Same colour scale as the web map's hazard layer and legend (model/hazard/infer.py:104-105 hazard.png:
// rgb = (255, 220(1-h), 30), alpha = min(1.6h, 1) x 200/255). A scale only: the number itself stays white.
// Stops every 0.125 up to the knee (h = 0.625), because CSS blends in premultiplied alpha: with only the end stops the
// transparent yellow at h = 0 would never show. Computed from the formula: G = floor(220(1-h)), alpha = min(1.6h, 1) x 200/255.
export const HAZARD_STOPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 1].map((h) =>
  [h, `rgba(255,${Math.floor(220 * (1 - h))},30,${+(Math.min(1.6 * h, 1) * 200 / 255).toFixed(3)})`]);
function hazardScale(g, x, y, w, h, v) {
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  for (const [t, c] of HAZARD_STOPS) gr.addColorStop(t, c);
  roundRect(g, x, y, w, h, h / 2); g.fillStyle = gr; g.fill();
  g.lineWidth = 2; g.strokeStyle = C.edge; g.stroke();
  if (!Number.isFinite(v)) return;
  const mx = x + Math.min(1, Math.max(0, v)) * w;
  g.fillStyle = C.value; g.beginPath(); g.moveTo(mx, y - 4); g.lineTo(mx - 9, y - 16); g.lineTo(mx + 9, y - 16); g.closePath(); g.fill();
}

/** Draw the 6 visor fields (strings from walk.js visorFields) onto ctx. */
export function drawVisor(g, f) {
  g.clearRect(0, 0, VISOR_W, VISOR_H);
  field(g, { x: 28, y: 28, w: 680, h: 250, label: "Walk-back margin", sub: "time left to walk back", value: f.margin, unit: "min", big: true,
    accent: f.marginT == null ? null : rampColor(f.marginT) });
  field(g, { x: 28, y: 330, w: 520, h: 170, label: "Time out", value: f.timeOut, unit: "min" });
  field(g, { x: 1102, y: 28, w: 470, h: 170, label: "Slope here", value: f.slope, unit: "°" });
  field(g, { x: 1102, y: 222, w: 470, h: 200, label: "AI hazard here", sub: "AI hazard estimate (validated on held-out terrain)", value: f.hazard, unit: "of 1" });
  hazardScale(g, 1102 + 270, 222 + 128, 175, 14, parseFloat(f.hazard));
  // next stop (id big, name smaller)
  panel(g, 28, 900 - 66 - 200, 800, 200);
  g.fillStyle = C.label; g.font = `600 30px ${FONT}`; g.fillText("Next stop", 54, 900 - 66 - 200 + 48);
  g.fillStyle = C.badge; g.font = `700 72px ${FONT}`; g.fillText(f.stopId, 54, 900 - 66 - 200 + 130);
  const idw = g.measureText(f.stopId).width;
  g.fillStyle = C.value; g.font = `600 44px ${FONT}`;
  let name = f.stopName; while (name.length > 4 && g.measureText(name).width > 800 - 80 - idw - 30) name = name.slice(0, -2) + "…";
  g.fillText(name, 54 + idw + 30, 900 - 66 - 200 + 128);
  field(g, { x: 1102, y: 900 - 66 - 200, w: 470, h: 200, label: "Sun height", sub: f.sunSub, value: f.sun, unit: "°" });
  g.fillStyle = C.muted; g.font = `20px ${FONT}`; g.textAlign = "center";
  if (f.sunNote) g.fillText(f.sunNote, 1337, 900 - 30);
  // badge + small reticle in the clear centre
  if (f.badge) {
    g.font = `800 30px ${FONT}`; const bw = g.measureText(f.badge).width + 44;
    roundRect(g, 905 - bw / 2, 26, bw, 46, 10); g.fillStyle = C.badge; g.fill();
    g.fillStyle = "#111"; g.textBaseline = "middle"; g.fillText(f.badge, 905, 50); g.textBaseline = "alphabetic";
  }
  // run 2: return route ("Get me home") in the clear top-centre band, home colour from docs/DESIGN_DIRECTION.md
  if (f.home) {
    const [t1, t2] = f.home, x = 905, w = 376, y = f.badge ? 86 : 28;
    roundRect(g, x - w / 2, y, w, 112, 16); g.fillStyle = C.panel; g.fill();
    g.lineWidth = 3; g.strokeStyle = "#7cc4ff"; g.stroke();
    g.textAlign = "center"; g.fillStyle = "#7cc4ff"; g.font = `700 30px ${FONT}`; g.fillText(t1, x, y + 44);
    g.fillStyle = C.value; g.font = `600 24px ${FONT}`;
    let t = t2; while (t.length > 4 && g.measureText(t).width > w - 24) t = t.slice(0, -2) + "…";
    g.fillText(t, x, y + 86);
    g.textAlign = "left";
  }
  // run 2: caption of the last voice callout (so the callouts can also be read), clear centre below the reticle
  if (f.caption) {
    g.font = `700 28px ${FONT}`; const cw = Math.min(380, g.measureText(f.caption).width + 40), x = 905;
    roundRect(g, x - cw / 2, 520, cw, 52, 26); g.fillStyle = C.panel; g.fill(); g.lineWidth = 2; g.strokeStyle = C.badge; g.stroke();
    g.fillStyle = C.value; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(f.caption, x, 547, 340);
    g.textBaseline = "alphabetic"; g.textAlign = "left";
  }
  g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 2; g.beginPath(); g.arc(800, 450, 12, 0, Math.PI * 2); g.stroke();
  g.textAlign = "left";
}
