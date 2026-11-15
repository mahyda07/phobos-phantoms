// Written with AI assistance (Claude).
// Console layout helpers for the web map (left sidebar). Track [P3].
//   1. Publishes the header's height as the CSS variable --hdr-h (console.css: #panel { top: var(--hdr-h) }).
//   2. On desktop (wider than 900 px) moves five Leaflet controls out of the map corners into the sidebar:
//      planner, play / follow / rings, proof view, demo -> section #tools-dock; layer list -> section #layers-dock.
//      Below that width they go back to their Leaflet corner in the order they first arrived there.
// Only DOM nodes move: every control keeps its own listeners and logic (planner.js, moving-map.js, proof.js,
// demo.js, Leaflet's layer control). toolFor and arrivalOrder are pure, so `node --test` can import this file.

export const DESKTOP_QUERY = "(min-width: 901px)";

/** The controls that are docked, in dock order. `cls` identifies the control's root element. */
export const TOOLS = [
  { slot: "planner", cls: "planner-control", corner: "topleft" },
  { slot: "play", cls: "mm-control", corner: "topleft" },
  { slot: "proof", cls: "proof-toggle", corner: "topleft" },
  { slot: "demo", cls: "demo-control", corner: "topleft" },
  { slot: "layers", cls: "leaflet-control-layers", corner: "topright" },
];

/** Pure: class list (array or "a b c" string) of an element -> its TOOLS entry, or null if it is not docked. */
export function toolFor(classNames) {
  const names = Array.isArray(classNames) ? classNames : String(classNames ?? "").split(/\s+/);
  return TOOLS.find((t) => names.includes(t.cls)) || null;
}

/** Pure: [{ seq, ... }] -> new array sorted by seq (the order the controls first arrived in their Leaflet corner). */
export function arrivalOrder(items) {
  return [...(items || [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

// --- header height -> --hdr-h ----------------------------------------------------------------------------------
let headerWatched = false;
function watchHeader() {
  if (headerWatched || typeof document === "undefined") return;
  const header = document.getElementById("header");
  if (!header) return;
  headerWatched = true;
  const publish = () => {
    const h = Math.ceil(header.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty("--hdr-h", `${h}px`);
  };
  publish();
  if (typeof ResizeObserver === "function") new ResizeObserver(publish).observe(header);
  else window.addEventListener("resize", publish);
}
watchHeader(); // at import time (module scripts run after the document is parsed), so the panel never jumps

// --- sidebar sections --------------------------------------------------------------------------------------------
function buildSections(panel) {
  let tools = document.getElementById("tools-dock");
  if (!tools) {
    tools = document.createElement("section");
    tools.id = "tools-dock";
    tools.className = "dock";
    tools.innerHTML = `<h2>Plan and play</h2>
      <p class="dock-hint">Press Plan a route, then click a start and an end on the map.
        <span class="dock-keys"><span class="dock-key"><i class="dock-dot start" aria-hidden="true"></i>A start</span><span class="dock-key"><i class="dock-dot end" aria-hidden="true"></i>B end</span></span></p>
      <div class="dock-slot" data-slot="planner"></div>
      <div class="dock-slot" data-slot="play"></div>
      <div class="dock-row"><div class="dock-slot" data-slot="proof"></div><div class="dock-slot" data-slot="demo"></div></div>`;
    panel.insertBefore(tools, document.getElementById("route-summary") || panel.firstChild);
  }
  let layers = document.getElementById("layers-dock");
  if (!layers) {
    layers = document.createElement("section");
    layers.id = "layers-dock";
    layers.className = "dock";
    layers.innerHTML = `<h2>Map layers</h2><div class="dock-slot" data-slot="layers"></div>`;
    panel.insertBefore(layers, document.getElementById("readout-section") || null);
  }
  const slots = {};
  for (const el of [...tools.querySelectorAll(".dock-slot"), ...layers.querySelectorAll(".dock-slot")]) slots[el.dataset.slot] = el;
  return { tools, layers, slots };
}

/** Called once from main.js right after the Leaflet map is created (before the other controls are added). */
export function initDock(map) {
  watchHeader();
  const panel = typeof document !== "undefined" ? document.getElementById("panel") : null;
  const mapEl = map?.getContainer?.();
  if (!panel || !mapEl || typeof matchMedia !== "function") return { map, destroy() {} };

  const { tools, layers, slots } = buildSections(panel);
  const corners = {
    topleft: mapEl.querySelector(".leaflet-top.leaflet-left"),
    topright: mapEl.querySelector(".leaflet-top.leaflet-right"),
  };
  const mq = matchMedia(DESKTOP_QUERY);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const seqOf = new WeakMap(); // control element -> arrival number in its Leaflet corner
  let seq = 0;
  const note = (el) => { if (!seqOf.has(el)) seqOf.set(el, ++seq); };
  const toolOf = (el) => (el && el.nodeType === 1 ? toolFor([...el.classList]) : null);

  // --- layer list: the L shortcut (main.js) toggles class "is-hidden" on the control. In the sidebar that is tied to
  // the fold state of the "Map layers" section, both ways, so L opens the section, scrolls to it and focuses the
  // first checkbox, and L again folds it.
  let lastHidden = false, lastCollapsed = false;
  const layersCtl = () => slots.layers.querySelector(".leaflet-control-layers");
  const remember = (ctl) => { lastHidden = ctl.classList.contains("is-hidden"); lastCollapsed = layers.classList.contains("mw-collapsed"); };
  const syncLayers = () => {
    const ctl = layersCtl();
    if (!ctl || !mq.matches) return;
    const hidden = ctl.classList.contains("is-hidden");
    const collapsed = layers.classList.contains("mw-collapsed");
    if (hidden !== lastHidden) {
      layers.classList.toggle("mw-collapsed", hidden);
      if (!hidden) {
        layers.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
        ctl.querySelector("input")?.focus({ preventScroll: true });
      }
    } else if (collapsed !== lastCollapsed) {
      ctl.classList.toggle("is-hidden", collapsed);
    }
    remember(ctl);
  };
  const classObs = new MutationObserver(syncLayers);
  classObs.observe(layers, { attributes: true, attributeFilter: ["class"] });

  // --- moving controls ---------------------------------------------------------------------------------------
  const dock = (el) => {
    const t = toolOf(el);
    if (!t) return;
    note(el);
    const slot = slots[t.slot];
    if (el.parentElement !== slot) slot.appendChild(el);
    if (t.slot === "layers") {
      el.classList.toggle("is-hidden", layers.classList.contains("mw-collapsed"));
      remember(el);
      classObs.observe(el, { attributes: true, attributeFilter: ["class"] });
    }
  };
  const dockAll = () => {
    for (const corner of Object.values(corners)) if (corner) [...corner.children].forEach(dock);
  };
  const undockAll = () => {
    const items = [];
    for (const slot of Object.values(slots)) {
      for (const el of [...slot.children]) { const t = toolOf(el); if (t) items.push({ el, t, seq: seqOf.get(el) ?? 0 }); }
    }
    for (const { el, t } of arrivalOrder(items)) {
      if (t.slot === "layers") el.classList.remove("is-hidden"); // back on the map: Leaflet's own "Layers" button
      corners[t.corner]?.appendChild(el);
    }
  };
  const apply = () => {
    const desktop = mq.matches;
    tools.hidden = layers.hidden = !desktop;
    if (desktop) dockAll(); else undockAll();
    requestAnimationFrame(() => map.invalidateSize?.());
  };

  // Controls are created at different times, and the proof toggle is destroyed and re-created on every new route.
  const cornerObs = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!toolOf(n) || n.parentElement !== r.target) continue;
        if (mq.matches) dock(n); else note(n);
      }
    }
  });
  for (const corner of Object.values(corners)) if (corner) cornerObs.observe(corner, { childList: true });

  // Guided tour (welcome.js) rings .mm-control, .planner-control, .leaflet-control-layers and .proof-toggle:
  // make sure their sections are open when the tour starts.
  const bodyObs = new MutationObserver((records) => {
    if (!mq.matches) return;
    for (const r of records) for (const n of r.addedNodes) {
      if (n.id === "mw-tour-ring") { tools.classList.remove("mw-collapsed"); layers.classList.remove("mw-collapsed"); }
    }
  });
  bodyObs.observe(document.body, { childList: true });

  // The planner needs clicks on the 2D map and the demo drives the 2D map: from the 3D view, switch to 2D first
  // (the P shortcut in main.js does the same). In 3D these buttons were not reachable before.
  const onToolClick = (e) => {
    if (!document.body.classList.contains("view-3d")) return;
    const b = e.target.closest?.(".planner-toggle, .demo-btn");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    document.querySelector('#view-toggle button[data-view="2d"]')?.click();
  };
  tools.addEventListener("click", onToolClick, true);

  const onChange = () => apply();
  if (mq.addEventListener) mq.addEventListener("change", onChange); else mq.addListener?.(onChange);
  apply();

  return {
    map,
    destroy() {
      cornerObs.disconnect(); classObs.disconnect(); bodyObs.disconnect();
      tools.removeEventListener("click", onToolClick, true);
      if (mq.removeEventListener) mq.removeEventListener("change", onChange); else mq.removeListener?.(onChange);
      undockAll();
      tools.remove(); layers.remove();
    },
  };
}
