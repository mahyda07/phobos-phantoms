// Written with AI assistance (Claude).
// Visor HUD drawn on a 1600 x 900 canvas, laid out after Kashif's visor design v1 (display/visor/).
// Centre band stays clear so the walker sees the terrain. All values are neutral white: no colour
// thresholds are published yet in docs/cost-model.md. Track [P5].
export const VISOR_W = 1600, VISOR_H = 900;
const C = { panel: "rgba(16,24,34,0.78)", edge: "#5b7186", label: "#b9c6d3", value: "#ffffff", muted: "#8796a5", badge: "#ffb000" };
const FONT = "system-ui, 'DejaVu Sans', sans-serif";

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function panel(g, x, y, w, h) {
  roundRect(g, x, y, w, h, 18); g.fillStyle = C.panel; g.fill();
  g.lineWidth = 3; g.strokeStyle = C.edge; g.stroke();
}
function field(g, { x, y, w, h, label, sub, value, unit, big }) {
  panel(g, x, y, w, h);
  g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.fillStyle = C.label; g.font = `600 30px ${FONT}`; g.fillText(label, x + 26, y + 48);
  let vy = y + 48;
  if (sub) { g.fillStyle = C.muted; g.font = `22px ${FONT}`; g.fillText(sub, x + 26, y + 80); vy = y + 80; }
  const vs = big ? 140 : 72;
  g.fillStyle = C.value; g.font = `700 ${vs}px ${FONT}`;
  const baseline = vy + (big ? 140 : 78);
  g.fillText(value, x + 26, baseline);
  if (unit) {
    const vw = g.measureText(value).width;
    g.fillStyle = C.label; g.font = `600 ${big ? 40 : 30}px ${FONT}`; g.fillText(unit, x + 26 + vw + 12, baseline);
  }
}

/** Draw the 6 visor fields (strings from walk.js visorFields) onto ctx. */
export function drawVisor(g, f) {
  g.clearRect(0, 0, VISOR_W, VISOR_H);
  field(g, { x: 28, y: 28, w: 680, h: 250, label: "Walk-back margin", sub: "time left to walk back safely", value: f.margin, unit: "min", big: true });
  field(g, { x: 28, y: 330, w: 520, h: 170, label: "Time out", value: f.timeOut, unit: "min" });
  field(g, { x: 1102, y: 28, w: 470, h: 170, label: "Slope here", value: f.slope, unit: "°" });
  field(g, { x: 1102, y: 222, w: 470, h: 200, label: "AI hazard here", sub: "AI hazard estimate (model, not validated)", value: f.hazard, unit: "of 1" });
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
  g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 2; g.beginPath(); g.arc(800, 450, 12, 0, Math.PI * 2); g.stroke();
  g.textAlign = "left";
}
