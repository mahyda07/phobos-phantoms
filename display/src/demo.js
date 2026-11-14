// Written with AI assistance (Claude).
// Demo mode: one "▶ Demo" button runs a ~30 s, repeatable walkthrough of the web map for a screen recording.
// RULE: the demo invents nothing. It only drives UI that already exists (map view, showPoint via setIndex,
// panel sections, the proof toggle, the stop cards) and shows short captions that say in plain words what is
// on screen. Captions carry no numbers: the real numbers are already on screen in the panel and the heads-up
// strip. The one count it mentions (science stops) is read from the route at runtime and written as a word.
//
// Leaflet is passed in as opts.L (and demo.css is imported by main.js), so `node --test` can import this file.

// One step per entry: { at: ms from start, do: action, args, caption }. A step without a caption keeps the
// caption already on screen. "{stopCount}" in a caption becomes the number of stops as a word ("five").
// Actions: intro, fitRoute, openSection, walk, fitArea... see runAction() below.
export const DEFAULT_SCRIPT = [
  { at: 0, do: "intro", args: {}, caption: "Real NASA terrain: Jezero Crater, western delta" },
  { at: 3000, do: "fitRoute", args: {},
    caption: "The planned route through {stopCount} science stops, coloured by the time left to walk back" },
  { at: 6000, do: "openSection", args: { id: "readout-section" } },
  { at: 6000, do: "walk", args: { delay: 1000, dur: 10500, zoomIn: 0.5 },
    caption: "Walking the route: margin, slope and next stop update at every point" },
  { at: 18000, do: "openSection", args: { id: "profile" },
    caption: "Height along the route, from the USGS elevation model" },
  { at: 18000, do: "fitRoute", args: {} },
  { at: 22000, do: "proof", args: { on: true, section: "proof" }, caption: "Checked against Perseverance's real path" },
  { at: 27000, do: "stopCard", args: { index: 0, section: "stops", zoomIn: 1 },
    caption: "Each stop has a real rover photo (NASA/JPL-Caltech)" },
  { at: 30000, do: "outro", args: {}, caption: "Marswalk · Phobos Phantoms" },
  { at: 32500, do: "finish", args: {} },
];

/** Index of the last step with at <= tMs, or -1 (before the first step / empty script). Script sorted by at. */
export function stepAt(script, tMs) {
  let k = -1;
  for (let i = 0; i < (script?.length || 0); i++) {
    if (script[i].at <= tMs) k = i;
    else break;
  }
  return k;
}

/** Route point index for a linear walk that starts at startMs and lasts durMs over n points, clamped 0..n-1. */
export function indexAtTime(tMs, startMs, durMs, n) {
  if (!(n > 0)) return 0;
  if (!(durMs > 0)) return tMs >= startMs ? n - 1 : 0;
  const frac = Math.max(0, Math.min(1, (tMs - startMs) / durMs));
  return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
}

/** Reduced-motion walk: the last "landmark" (start, stop vertices, end) at or before the linear index. */
export function snapToStops(i, stopVertices, n) {
  if (!(n > 0)) return 0;
  const marks = [0, ...stopVertices.filter((v) => v >= 0 && v < n), n - 1].sort((a, b) => a - b);
  let out = 0;
  for (const m of marks) if (m <= i) out = m;
  return out;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** Fill "{stopCount}" with the stop count as a word; without stops the phrase is dropped. Never writes digits. */
export function fillCaption(caption, { stopCount = 0 } = {}) {
  const s = String(caption ?? "");
  if (!s.includes("{stopCount}")) return s;
  if (stopCount > 0 && stopCount < WORDS.length) return s.replace("{stopCount}", WORDS[stopCount]);
  if (stopCount > 0) return s.replace("{stopCount}", "its");
  return s.replace(/ through \{stopCount\} science stops/, "").replace("{stopCount}", "the");
}

/** Total demo length in ms: time of the last step. */
export function scriptDuration(script) {
  return script?.length ? Math.max(...script.map((s) => s.at)) : 0;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Adds the Demo control (top-left, under the existing controls).
 * opts: { L, f, getRouteLatLngs() -> [[lat,lng]...], pointCount() -> n, setIndex(i) (the page's showPoint),
 *         stops() -> [{id, vertex}], openSection(id), clickProof(), closeWelcome(), script }.
 * Returns { start(), stop(), destroy() }.
 */
export function initDemo(map, {
  L, f, getRouteLatLngs = () => [], pointCount = () => 0, setIndex = () => {}, stops = () => [],
  openSection = () => {}, clickProof = () => {}, closeWelcome = () => {}, script = DEFAULT_SCRIPT,
} = {}) {
  if (!L) throw new TypeError("initDemo: pass the Leaflet module as opts.L");
  const steps = [...script].sort((a, b) => a.at - b.at);
  const total = scriptDuration(steps);
  const container = map.getContainer();

  // --- DOM ---------------------------------------------------------------
  const root = L.DomUtil.create("div", "leaflet-control demo-control");
  L.DomEvent.disableClickPropagation(root);
  L.DomEvent.disableScrollPropagation(root);
  const btn = L.DomUtil.create("button", "demo-btn", root);
  btn.type = "button";

  const caption = L.DomUtil.create("div", "demo-caption", container);
  caption.setAttribute("aria-live", "polite");
  caption.setAttribute("role", "status");
  const captionText = L.DomUtil.create("span", "demo-caption-text", caption);
  const progress = L.DomUtil.create("div", "demo-progress", container);
  const progressBar = L.DomUtil.create("div", "demo-progress-bar", progress);
  progress.setAttribute("aria-hidden", "true");
  L.DomEvent.disableClickPropagation(caption);

  const Ctl = L.Control.extend({ options: { position: "topleft" }, onAdd: () => root, onRemove: () => {} });
  const control = new Ctl().addTo(map);

  // --- state -------------------------------------------------------------
  let running = false;
  let raf = 0;
  let t0 = 0;
  let nextStep = 0;
  let walk = null;       // { start, dur, n, snap } while walking
  let lastIndex = -1;
  let saved = null;      // what to put back on stop
  let captionTimer = 0;

  const ll = () => getRouteLatLngs() || [];
  const n = () => Number(pointCount()) || 0;
  const stopList = () => [...(stops() || [])].filter((s) => Number.isFinite(s?.vertex)).sort((a, b) => a.vertex - b.vertex);
  const panel = () => document.getElementById("panel");
  const proofOn = () => document.querySelector(".proof-toggle button")?.getAttribute("aria-pressed") === "true";
  const anim = () => !reducedMotion();

  function syncButton() {
    const ok = n() > 0;
    btn.textContent = running ? "■ Stop" : "▶ Demo";
    btn.setAttribute("aria-label", running ? "Stop the demo" : "Run the demo walkthrough");
    btn.setAttribute("aria-pressed", String(running));
    btn.classList.toggle("active", running);
    btn.disabled = !running && !ok;
    const tip = !running && !ok ? "Demo needs a planned route" : running ? "Stop the demo" : "Run a 30-second walkthrough";
    btn.title = tip;
    root.title = tip; // disabled buttons show no tooltip in some browsers; the wrapper still does
  }

  // --- view helpers ------------------------------------------------------
  const fitArea = () => {
    if (!f?.leafletBounds) return;
    map.fitBounds(f.leafletBounds(), { paddingTopLeft: [0, 70], paddingBottomRight: [0, 10], animate: anim(), duration: 1 });
  };
  const fitRoute = () => {
    const pts = ll();
    if (!pts.length) { fitArea(); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], animate: anim(), duration: 1 });
  };
  const zoomTo = (latlng, zoomIn) => {
    const z = Math.min(map.getMaxZoom(), map.getBoundsZoom(f.leafletBounds()) + (zoomIn || 0));
    if (anim()) map.flyTo(latlng, z, { duration: 0.9 });
    else map.setView(latlng, z, { animate: false });
  };
  // End a walk that is under way: put the walker on its last point so the next step starts from the end.
  const endWalk = () => {
    if (walk && lastIndex >= 0 && lastIndex < walk.n - 1) goTo(walk.n - 1);
    walk = null;
  };
  const goTo = (i) => {
    const k = Math.max(0, Math.min(n() - 1, i));
    if (k === lastIndex) return;
    lastIndex = k;
    setIndex(k);
  };

  function showCaption(text) {
    clearTimeout(captionTimer);
    if (!text) return;
    if (!anim() || !caption.classList.contains("show")) {
      captionText.textContent = text;
      caption.classList.add("show");
      return;
    }
    caption.classList.remove("show");
    captionTimer = setTimeout(() => { captionText.textContent = text; caption.classList.add("show"); }, 220);
  }
  function hideCaption() {
    clearTimeout(captionTimer);
    caption.classList.remove("show");
  }

  // --- actions -----------------------------------------------------------
  function runAction(step, now) {
    const a = step.args || {};
    if (a.section) openSection(a.section);
    switch (step.do) {
      case "intro":
        closeWelcome();
        fitArea();
        break;
      case "fitArea": fitArea(); break;
      case "fitRoute": endWalk(); fitRoute(); break;
      case "openSection": if (a.id) openSection(a.id); break;
      case "walk": {
        const count = n();
        if (!count) break;
        goTo(0);
        const p = ll()[0];
        if (p) zoomTo(p, a.zoomIn);
        walk = { start: now + (a.delay || 0), dur: a.dur || 10000, n: count, snap: !anim() };
        break;
      }
      case "proof":
        endWalk();
        if (Boolean(a.on) !== proofOn()) clickProof();
        break;
      case "stopCard": {
        endWalk();
        const s = stopList()[a.index || 0];
        if (!s) break;
        goTo(s.vertex);
        const p = ll()[s.vertex];
        if (p) zoomTo(p, a.zoomIn);
        const card = document.querySelector(`#stops .sc-card[data-id="${CSS.escape(String(s.id))}"]`);
        if (card) {
          document.querySelectorAll("#stops .sc-card.active").forEach((c) => c.classList.remove("active"));
          card.classList.add("active");
          card.scrollIntoView({ block: "nearest", behavior: anim() ? "smooth" : "auto" });
        }
        break;
      }
      case "outro":
        endWalk();
        if (saved && proofOn() !== saved.proof) clickProof();
        fitArea();
        break;
      case "finish":
        stop();
        return;
      default:
        break; // unknown action: caption only
    }
    if (step.caption) showCaption(fillCaption(step.caption, { stopCount: stopList().length }));
  }

  // --- loop --------------------------------------------------------------
  function frame(now) {
    if (!running) return;
    const t = now - t0;
    while (running && nextStep < steps.length && steps[nextStep].at <= t) runAction(steps[nextStep++], t);
    if (!running) return;
    if (walk && t >= walk.start) {
      let i = indexAtTime(t, walk.start, walk.dur, walk.n);
      if (walk.snap) i = snapToStops(i, stopList().map((s) => s.vertex), walk.n);
      if (i !== lastIndex) {
        goTo(i);
        const p = ll()[i];
        if (p) map.panTo(p, { animate: false });
      }
      if (t >= walk.start + walk.dur) walk = null;
    }
    progressBar.style.transform = `scaleX(${total > 0 ? Math.min(1, t / total) : 1})`;
    raf = requestAnimationFrame(frame);
  }

  // --- public ------------------------------------------------------------
  function start() {
    if (running || n() === 0) return;
    const p = panel();
    saved = {
      proof: proofOn(),
      collapsed: [...(p?.querySelectorAll(":scope > section") || [])].map((s) => [s, s.classList.contains("mw-collapsed")]),
      activeCards: [...document.querySelectorAll("#stops .sc-card.active")],
      scrollTop: p?.scrollTop || 0,
      index: Number(document.getElementById("point-slider")?.value) || 0, // where the walker was before the demo
    };
    // A running moving-map playback would fight the demo's walk: pause it through its own button.
    const mmPlay = document.querySelector(".mm-control .mm-play[aria-pressed='true']");
    if (mmPlay) mmPlay.click();
    map.stop?.();
    running = true;
    nextStep = 0;
    walk = null;
    lastIndex = -1;
    document.body.classList.add("demo-running");
    container.classList.toggle("demo-reduced", !anim());
    progress.classList.add("show");
    progressBar.style.transform = "scaleX(0)";
    syncButton();
    t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    walk = null;
    hideCaption();
    progress.classList.remove("show");
    document.body.classList.remove("demo-running");
    if (saved) {
      if (proofOn() !== saved.proof) clickProof();
      for (const [s, was] of saved.collapsed) s.classList.toggle("mw-collapsed", was);
      document.querySelectorAll("#stops .sc-card.active").forEach((c) => c.classList.remove("active"));
      saved.activeCards.forEach((c) => c.isConnected && c.classList.add("active"));
      const p = panel();
      if (p) p.scrollTop = saved.scrollTop;
      if (n() > 0) setIndex(Math.min(saved.index, n() - 1));
      saved = null;
    }
    map.stop?.();
    fitArea();
    syncButton();
  }

  const onClick = () => (running ? stop() : start());
  const onLayers = () => { if (!running) syncButton(); }; // a route drawn later (live planner) enables the button
  L.DomEvent.on(btn, "click", onClick);
  map.on("layeradd layerremove", onLayers);
  syncButton();

  return {
    start,
    stop,
    destroy() {
      stop();
      L.DomEvent.off(btn, "click", onClick);
      map.off("layeradd layerremove", onLayers);
      caption.remove();
      progress.remove();
      control.remove();
    },
  };
}
