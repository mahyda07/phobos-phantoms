// Written with AI assistance (Claude, for Ramish).
// Welcome screen, guided tour, foldable panel sections and brand header for the web map.
// Reads only the same data files as the map (data/route.json, data/window.json, data/stops.csv).
// Does not change how anything is drawn; Kashif's modules stay as they are.
const HEADSET_URL = "https://phantom-phobos.vercel.app";
const DATA = "data/";
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

async function json(name) {
  try { const r = await fetch(DATA + name); if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null; return await r.json(); } catch { return null; }
}
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------- header ----------
function brandHeader() {
  const h = document.getElementById("header");
  if (!h) return;
  const title = h.querySelector(".title");
  if (title) title.innerHTML = `<div class="mw-brand"><span class="mw-dot"></span>Marswalk <em>web map · Jezero western delta</em></div>`;
  const links = el("div", "mw-links");
  const tour = el("button", "mw-pill", "Guided tour"); tour.type = "button"; tour.onclick = () => startTour();
  const head = el("a", "mw-pill hot", "Open in headset ↗"); head.href = HEADSET_URL; head.target = "_blank"; head.rel = "noopener";
  links.append(tour, head); h.appendChild(links);
}

// ---------- foldable sections (only Route and "At this point" open at first) ----------
function foldable() {
  const panel = document.getElementById("panel");
  if (!panel) return;
  const open = new Set(["route-summary", "readout-section"]);
  panel.querySelectorAll(":scope > section").forEach((s) => { if (!open.has(s.id)) s.classList.add("mw-collapsed"); });
  panel.addEventListener("click", (e) => {
    const h = e.target.closest("section > h2");
    if (h && h.parentElement.parentElement === panel) h.parentElement.classList.toggle("mw-collapsed");
  });
  // opening the proof view on the map opens its panel section too
  document.addEventListener("click", (e) => {
    if (e.target.closest(".proof-toggle")) document.getElementById("proof")?.classList.remove("mw-collapsed");
  }, true);
}

// ---------- welcome ----------
let welcome;
async function buildWelcome() {
  welcome = el("section", "", `
    <div class="mw-stars"></div>
    <div class="mw-card" role="dialog" aria-label="Welcome">
      <div class="mw-eyebrow">NASA Space Apps 2026 · Phobos Phantoms OG 7.66</div>
      <h1>Mars<span>walk</span></h1>
      <p class="mw-lead">A safety map for a walk on <b>Jezero Crater, Mars</b>. Real NASA terrain, a planned route through five science stops, and the time you'd have left to walk back at every step.</p>
      <div class="mw-chips" id="mw-chips"><div class="mw-chip">Loading mission data…</div></div>
      <ol class="mw-steps">
        <li><b><i>1</i>Read the route</b>Its colour is your walk-back margin: green is plenty of time, red is little.</li>
        <li><b><i>2</i>Walk it</b>Scrub the slider or press Play: slope, hazard and next stop at every point.</li>
        <li><b><i>3</i>Plan your own</b>Click a start and an end. The planner service answers in about a second.</li>
      </ol>
      <div class="mw-cta">
        <button class="mw-btn primary" id="mw-go" type="button">Explore the map</button>
        <button class="mw-btn" id="mw-tour" type="button">Take the 30-second tour</button>
        <a class="mw-btn" href="${HEADSET_URL}" target="_blank" rel="noopener">Open in headset ↗</a>
      </div>
      <p class="mw-foot">Every number on screen comes from a file in the project repo. Stand-in results are labelled.</p>
    </div>`);
  welcome.id = "mw-welcome";
  document.body.appendChild(welcome);
  welcome.querySelector("#mw-go").onclick = () => closeWelcome();
  welcome.querySelector("#mw-tour").onclick = () => { closeWelcome(); setTimeout(startTour, 450); };
  addEventListener("keydown", (e) => { if (e.key === "Escape") { closeWelcome(); endTour(); } });

  const [route, win] = await Promise.all([json("route.json"), json("window.json")]);
  const chips = welcome.querySelector("#mw-chips"); chips.innerHTML = "";
  const add = (h, c = "") => chips.appendChild(el("div", "mw-chip " + c, h));
  add("<b>1.5 × 1.5 km</b> of real NASA terrain, 2 m grid");
  const p = route?.properties;
  if (p) {
    add(`Planned route <b>${(p.length_m / 1000).toFixed(2)} km</b>`);
    if (p.stops?.length) add(`<b>${p.stops.length}</b> science stops`);
    if (p.margin_min != null) add(`Walk-back margin <b>${Math.floor(p.margin_min)} min</b>`);
  }
  if (win?.eva_window) add(`EVA window <b>${String(win.eva_window.start_ltst).padStart(2, "0")}:00–${String(win.eva_window.end_ltst).padStart(2, "0")}:00</b> local solar time`);
  if (String(p?.plan_id || "").startsWith("standin-")) add("Stand-in planner", "warn");
}
function closeWelcome() { welcome?.classList.add("out"); store.set("mw-seen", "1"); }
function openWelcome() { welcome?.classList.remove("out"); }

// ---------- guided tour ----------
const STEPS = [
  { sel: "#route-summary", title: "The plan at a glance", text: "Length, walk out and back times, steepest slope, and the walk-back margin: the time left to get home safely at the worst point." },
  { sel: "#readout-section", title: "Walk it point by point", text: "Drag the slider along the route. The map marker, margin, slope, hazard and next stop follow." },
  { sel: ".mm-control", title: "Play the walk", text: "Play animates the walker; Follow keeps it centred; Rings show how far you could still go." },
  { sel: ".planner-control", title: "Plan your own route", text: "Press Plan a route, then click a start and an end on the map. Choose stops; the live planner answers." },
  { sel: ".leaflet-control-layers", title: "Map layers", text: "Switch slope, roughness, elevation and the science signal; show or hide Perseverance's real path." },
  { sel: ".proof-toggle", title: "Proof against Perseverance", text: "Compare our route with where NASA actually drove the rover, and read the numbers in the panel." },
];
let tourI = -1, ring, tip;
function startTour() {
  closeWelcome();
  ring ??= Object.assign(document.body.appendChild(el("div")), { id: "mw-tour-ring" });
  tip ??= Object.assign(document.body.appendChild(el("div")), { id: "mw-tour-tip" });
  tourI = -1; nextStep(1);
}
function endTour() { ring?.remove(); tip?.remove(); ring = tip = null; tourI = -1; }
function nextStep(dir) {
  let i = tourI;
  do { i += dir; } while (i >= 0 && i < STEPS.length && !document.querySelector(STEPS[i].sel));
  if (i < 0 || i >= STEPS.length) { endTour(); return; }
  tourI = i;
  const s = STEPS[i], target = document.querySelector(s.sel);
  if (target.tagName === "SECTION") target.classList.remove("mw-collapsed");
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  setTimeout(() => {
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + 2 * pad + "px", height: Math.min(r.height, innerHeight - 20) + 2 * pad + "px" });
    tip.innerHTML = `<b>${s.title}</b>${s.text}<div class="mw-row"><span class="mw-count">${i + 1} / ${STEPS.length}</span><span><button class="mw-pill" id="mw-skip" type="button">Skip</button> <button class="mw-pill hot" id="mw-next" type="button">${i === STEPS.length - 1 ? "Done" : "Next"}</button></span></div>`;
    const w = 300, gap = 14;
    let left = r.left - w - gap; if (left < 10) left = r.right + gap; if (left + w > innerWidth - 10) left = Math.max(10, innerWidth - w - 10);
    let top = Math.min(Math.max(10, r.top), innerHeight - 190);
    Object.assign(tip.style, { left: left + "px", top: top + "px" });
    tip.querySelector("#mw-next").onclick = () => nextStep(1);
    tip.querySelector("#mw-skip").onclick = endTour;
  }, 260);
}

// ---------- help button ----------
function helpButton() {
  const b = el("button", "", "?"); b.id = "mw-help"; b.type = "button"; b.title = "Welcome and tour";
  b.onclick = openWelcome; document.body.appendChild(b);
}

export function initWelcome() {
  brandHeader(); foldable(); helpButton(); buildWelcome();
}
