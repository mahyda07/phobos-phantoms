// Written with AI assistance (Claude).
// In-headset UI kit (run 2 MR UI overhaul): buttons with normal / hover / press states, glass backplates, controller
// rays + cursor. Style from docs/DESIGN_DIRECTION.md and ui-ux-pro-max "Spatial UI": hover feedback on what the ray
// points at, scale on focus, press confirmation, 4.5:1 text contrast. Textures are cached per state, so hover only
// swaps a map (no canvas re-upload per frame). Track [P5].
import * as THREE from "three";

export const T = {   // tokens (docs/DESIGN_DIRECTION.md)
  bg: "#06090f", panel: "rgba(12,17,26,0.86)", panelSolid: "#0c111a", text: "#eef2f6", muted: "#9aa8b6",
  line: "rgba(255,255,255,0.14)", mars: "#ff7a3d", mars2: "#ffb26b", onMars: "#06090f", home: "#7cc4ff", ok: "#5ee2a0",
  font: "'Host Grotesk', system-ui, 'Segoe UI', sans-serif", mono: "'JetBrains Mono', ui-monospace, monospace",
};
const PX_PER_M = 4000;           // canvas pixels per metre of button (sharp at 0.5–0.7 m)

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

/** Paint one button state onto a canvas. kind: "default" | "primary" | "home"; state: "normal" | "hover" | "press"; on: toggle. */
export function paintButton(g, w, h, { label, sub = "", kind = "default", state = "normal", on = null }) {
  g.clearRect(0, 0, w, h);
  const r = h * 0.28, pad = 6;
  const fill = kind === "primary" ? (state === "normal" ? T.mars : T.mars2)
    : kind === "home" ? (state === "normal" ? "#3d6f96" : "#4f86b3")
    : state === "normal" ? "rgba(22,30,42,0.92)" : state === "hover" ? "rgba(38,50,66,0.96)" : "rgba(52,66,84,0.98)";
  rr(g, pad, pad, w - pad * 2, h - pad * 2, r); g.fillStyle = fill; g.fill();
  g.lineWidth = state === "normal" ? 3 : 6;
  g.strokeStyle = state === "normal" ? T.line : kind === "home" ? T.home : T.mars2; g.stroke();
  const ink = kind === "primary" ? T.onMars : T.text;
  g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle";
  const fs = Math.round(h * (sub ? 0.32 : 0.38));
  g.font = `600 ${fs}px ${T.font}`;
  const cx = on == null ? w / 2 : w / 2 + h * 0.18;
  g.fillText(label, cx, sub ? h * 0.40 : h / 2, w - h * 0.9);
  if (sub) { g.font = `500 ${Math.round(h * 0.25)}px ${T.font}`; g.fillStyle = kind === "primary" ? T.onMars : T.muted; g.fillText(sub, cx, h * 0.72, w - h * 0.9); }
  if (on != null) {                                          // toggle pip on the left
    g.beginPath(); g.arc(h * 0.42, h / 2, h * 0.12, 0, Math.PI * 2);
    g.fillStyle = on ? T.ok : "rgba(255,255,255,0.18)"; g.fill();
  }
}

/** A 3D button: plane mesh with cached textures per state. onPress() fires on select/pinch. */
export function makeButton({ label, sub = "", w = 0.1, h = 0.045, kind = "default", onPress, toggle = null }) {
  const cw = Math.round(w * PX_PER_M), ch = Math.round(h * PX_PER_M);
  const cache = new Map();
  const st = { label, sub, kind, on: toggle, state: "normal" };
  const tex = () => {
    const key = `${st.label}|${st.sub}|${st.state}|${st.on}`;
    if (!cache.has(key)) {
      const c = document.createElement("canvas"); c.width = cw; c.height = ch;
      paintButton(c.getContext("2d"), cw, ch, st);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      cache.set(key, t);
      if (cache.size > 12) { const [k0, t0] = cache.entries().next().value; t0.dispose(); cache.delete(k0); }
    }
    return cache.get(key);
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex(), transparent: true, depthWrite: false, fog: false }));
  mesh.renderOrder = 3;
  const apply = () => { mesh.material.map = tex(); mesh.material.needsUpdate = true; };
  mesh.userData = {
    ui: true, onPress,
    setState(s) { if (st.state === s) return; st.state = s; apply(); mesh.scale.setScalar(s === "hover" ? 1.06 : s === "press" ? 0.96 : 1); },
    setText(l, s2 = st.sub) { if (l === st.label && s2 === st.sub) return; st.label = l; st.sub = s2; apply(); },
    setOn(v) { if (st.on === v) return; st.on = v; apply(); },
    get state() { return st.state; },
  };
  return mesh;
}

/** Glass backplate behind a group of buttons (title optional). */
export function makePlate({ w, h, title = "" }) {
  const cw = Math.round(w * 2000), ch = Math.round(h * 2000);
  const c = document.createElement("canvas"); c.width = cw; c.height = ch;
  const g = c.getContext("2d");
  rr(g, 4, 4, cw - 8, ch - 8, 36); g.fillStyle = T.panel; g.fill(); g.lineWidth = 3; g.strokeStyle = T.line; g.stroke();
  if (title) { g.fillStyle = T.muted; g.font = `600 ${Math.round(ch * 0.13)}px ${T.font}`; g.textBaseline = "top"; g.fillText(title, 28, 22); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  m.renderOrder = 2;
  return m;
}

/** Controller ray (fades out) + cursor ring at the hit point. Attach the ray to the controller; the cursor to the scene. */
export function makeRay() {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  g.setAttribute("color", new THREE.Float32BufferAttribute([1, 0.7, 0.45, 1, 0.7, 0.45], 3));
  g.setAttribute("alpha", new THREE.Float32BufferAttribute([1, 0], 1));
  const ray = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
  ray.name = "ray"; ray.scale.z = 2; ray.renderOrder = 4;
  const cursor = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.009, 24),
    new THREE.MeshBasicMaterial({ color: 0xffb26b, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false }));
  cursor.renderOrder = 12; cursor.visible = false;
  return { ray, cursor };
}
