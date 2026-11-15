// Written with AI assistance (Claude).
// Welcome screen, guide, toasts and HUD wiring for the headset page. Listens to "phobos:*" events from main.js.
// Track [P5].
const $ = (id) => document.getElementById(id);
const welcome = $("welcome"), goAR = $("go-ar"), goPrev = $("go-preview"), note = $("xr-note"), bar = $("bar");
const hud = [$("brand"), $("ui")];
let ready = false, xr = null;

bar.style.width = "35%";
function toast(title, body, ms = 5200) {
  const t = document.createElement("div"); t.className = "toast";
  t.innerHTML = `<b>${title}</b>${body}`;
  $("toasts").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, ms);
}
function closeWelcome() {
  welcome.classList.add("out");
  hud.forEach((el) => el.classList.remove("hidden"));
}
function openWelcome() { welcome.classList.remove("out"); }

function refreshCTA() {
  if (!ready || xr === null) return;
  if (xr.ar) {
    goAR.disabled = false; note.className = "note good";
    note.textContent = "Headset ready. Put the Quest on, look at a clear table, then press Enter mixed reality.";
  } else {
    goAR.disabled = true;
    note.className = "note";
    note.textContent = xr.vr ? "Mixed reality isn't available here; use Preview, or Enter VR from the toolbar."
      : "To step in, open this page in the Meta Quest Browser. On this screen you can preview everything.";
  }
}

window.addEventListener("phobos:ready", (e) => {
  const d = e.detail; ready = true; bar.style.width = "100%";
  const chips = $("chips"); chips.innerHTML = "";
  const add = (html, cls = "") => { const c = document.createElement("div"); c.className = "chip " + cls; c.innerHTML = html; chips.appendChild(c); };
  add("<b>1.5 × 1.5 km</b> of real NASA terrain");
  if (d.length_km) add(`Planned route <b>${d.length_km.toFixed(2)} km</b>`);
  if (d.stops) add(`<b>${d.stops}</b> science stops`);
  if (d.margin_min != null) add(`Walk-back margin <b>${Math.floor(d.margin_min)} min</b>`);
  if (d.eva) add(`EVA window <b>${String(d.eva.start_ltst).padStart(2, "0")}:00–${String(d.eva.end_ltst).padStart(2, "0")}:00</b> local solar time`);
  if (d.standin) { add("Stand-in planner", "warn"); $("badge").classList.remove("hidden"); }
  setTimeout(() => (bar.parentElement.style.opacity = "0"), 700);
  refreshCTA();
});
window.addEventListener("phobos:xr", (e) => {
  xr = e.detail; refreshCTA();
  if (!xr.ar) $("btn-ar").classList.add("hidden");   // keep the toolbar to what this device can do
  if (!xr.vr) $("btn-vr").classList.add("hidden");
  if (!xr.ar && !xr.vr) document.querySelector("#ui .sep").classList.add("hidden");
});
window.addEventListener("phobos:session", () => { welcome.classList.add("out"); });
window.addEventListener("phobos:session-end", () => toast("Back on your screen", "Press Enter mixed reality to go back in."));
window.addEventListener("phobos:walk", (e) => {
  if (e.detail.on) toast("Walking the planned route", "Full size, at 30× speed. Drag to look around. Press Step in / out to return to the desk view.", 6500);
});

window.addEventListener("phobos:mute", (e) => toast(e.detail.muted ? "Sound off" : "Sound on", e.detail.muted ? "Press M (or X on the controller) to turn it back on." : "Voice callouts and sounds are on.", 2600));
window.addEventListener("phobos:heard", (e) => toast("Heard", `“${e.detail.said.replace(/[<>&]/g, "")}”`, 2600));
window.addEventListener("phobos:ghost", (e) => {   // run 2: ghost rover
  const d = e.detail;
  if (d.missing) toast("Ghost rover", "Perseverance's path file is not loaded.");
  else toast(d.on ? d.title : "Ghost rover hidden", d.on ? `${d.note}. Press G (or B) to hide.` : "Press G (or B) to show it again.", 5200);
});
window.addEventListener("phobos:home", (e) => {   // run 2: Get me home
  const d = e.detail;
  if (d.state === "not-walking") toast("Get me home", "Step in first: it plans from your spot on the walk back to its start.");
  if (d.state === "waking") toast("Waking the planner", "The free server sleeps when idle; this can take up to a minute.", 7000);
  if (d.state === "ready" || d.state === "fallback") toast(d.state === "ready" ? "Return route ready" : "Planner offline", d.text, 8000);
});
goAR.onclick = () => { closeWelcome(); $("btn-ar").click(); };
goPrev.onclick = () => {
  closeWelcome();
  toast("Preview mode", "Drag to orbit · scroll to zoom · try <strong>Step in / out</strong> to walk the route.", 6500);
};
$("btn-help").onclick = openWelcome;
$("btn-data").onclick = () => $("datapanel").classList.toggle("hidden");
addEventListener("keydown", (e) => { if (e.key === "Escape" && !welcome.classList.contains("out") && ready) goPrev.click(); });
