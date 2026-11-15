// Written with AI assistance (Claude).
// Keyboard shortcuts + screen-reader support for the web map, added at runtime so other modules stay as they are.
//   - document keydown -> keyAction(e) -> step along the route, play, follow, rings, proof view, help
//   - polite live region: "Point 701 of 1822" after keyboard moves (trailing throttle, so holding a key reads once)
//   - "?" help dialog listing SHORTCUTS (role=dialog, aria-modal, focus trapped, Escape closes, focus returns)
//   - "Skip to side panel" link as the first focusable element
//   - runtime fixes: #map label, names for icon-only buttons, Space on stop cards, panel section headings as real
//     disclosure buttons (welcome.js folds sections on h2 click only), slider aria-valuetext, focus handling for the
//     welcome dialog (#mw-welcome, welcome.js) while it is open.
// keyAction and SHORTCUTS are pure (no DOM), so `node --test` can import this file.

/** Shortcut list for the help dialog. `ids` = the keyAction names each row covers (used by the tests). */
export const SHORTCUTS = [
  { keys: "← / →", action: "Move one point along the route", ids: ["prev", "next"] },
  { keys: "Shift + ← / →", action: "Move ten points along the route", ids: ["prev10", "next10"] },
  { keys: "Home / End", action: "Jump to the start / end of the route", ids: ["first", "last"] },
  { keys: "Space", action: "Play / pause the walk", ids: ["play"] },
  { keys: "2 / 3", action: "Map view (2D) / terrain view (3D)", ids: ["view2", "view3"] },
  { keys: "P", action: "Plan a route (click start, then end)", ids: ["plan"] },
  { keys: "H", action: "Show / hide the AI hazard layer", ids: ["hazard"] },
  { keys: "G", action: "Show / hide Perseverance's real path", ids: ["ghost"] },
  { keys: "L", action: "Open / close the layers list", ids: ["layers"] },
  { keys: "R", action: "Reset the view to the whole walking area", ids: ["reset"] },
  { keys: "+ / −", action: "Zoom in / out", ids: ["zoomIn", "zoomOut"] },
  { keys: "F", action: "Follow the current point on the map", ids: ["follow"] },
  { keys: "O", action: "Show / hide distance rings", ids: ["rings"] },
  { keys: "V", action: "Proof view: compare with Perseverance's real path", ids: ["proof"] },
  { keys: "W A S D, Q / E", action: "3D view: pan, rotate", ids: [] },
  { keys: "?", action: "Show this list of shortcuts", ids: ["help"] },
  { keys: "Esc", action: "Close this dialog", ids: ["close"] },
];

const NAV = new Set(["next", "prev", "next10", "prev10", "first", "last"]);
// Elements where Space already means "activate" (native or ARIA buttons): Space must not start playback there.
const SPACE_NATIVE_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);
const SPACE_NATIVE_ROLES = new Set(["button", "link", "checkbox", "radio", "switch", "menuitem", "tab", "option"]);

function roleOf(t) {
  if (!t) return "";
  if (typeof t.getAttribute === "function") return String(t.getAttribute("role") || "").toLowerCase();
  return String(t.role || "").toLowerCase();
}

/**
 * Pure: KeyboardEvent-like { key, shiftKey, ctrlKey, metaKey, altKey, target: { tagName, isContentEditable, type } }
 * -> action name or null.
 */
export function keyAction(e) {
  if (!e || typeof e.key !== "string") return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target || {};
  const tag = String(t.tagName || "").toUpperCase();
  const type = String(t.type || "").toLowerCase();
  const isRange = tag === "INPUT" && type === "range";
  if (t.isContentEditable || tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !isRange)) return null;

  let action = null;
  switch (e.key) {
    case "ArrowRight": case "Right": action = e.shiftKey ? "next10" : "next"; break;
    case "ArrowLeft": case "Left": action = e.shiftKey ? "prev10" : "prev"; break;
    case "Home": action = "first"; break;
    case "End": action = "last"; break;
    case " ": case "Spacebar": action = "play"; break;
    case "p": case "P": action = "plan"; break;           // run 2: P = plan (brief); play stays on Space
    case "f": case "F": action = "follow"; break;
    case "o": case "O": action = "rings"; break;          // run 2: rings moved from R to O (R = reset view)
    case "r": case "R": action = "reset"; break;
    case "2": action = "view2"; break;
    case "3": action = "view3"; break;
    case "h": case "H": action = "hazard"; break;
    case "g": case "G": action = "ghost"; break;
    case "l": case "L": action = "layers"; break;
    case "+": case "=": action = "zoomIn"; break;
    case "-": case "_": action = "zoomOut"; break;
    case "v": case "V": action = "proof"; break;
    case "?": action = "help"; break;
    case "Escape": case "Esc": action = "close"; break;
    default: return null;
  }
  // The range slider keeps its own arrow / Home / End keys.
  if (isRange && NAV.has(action)) return null;
  // Space activates buttons, links, summaries and ARIA buttons (stop cards): leave it to them.
  if ((e.key === " " || e.key === "Spacebar") && (SPACE_NATIVE_TAGS.has(tag) || SPACE_NATIVE_ROLES.has(roleOf(t)))) return null;
  return action;
}

// ---------------------------------------------------------------------------------------------------------------
// DOM part (browser only)

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// Names for buttons that show only a glyph. Keyed by id or by visible glyph.
const ICON_NAMES_BY_ID = { "mw-help": "Welcome screen and guided tour" };
const ICON_NAMES_BY_GLYPH = { "?": "Help", "×": "Close", "✕": "Close", "▶": "Play", "❚❚": "Pause", "+": "Zoom in", "−": "Zoom out", "-": "Zoom out" };

const isVisible = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(isVisible);
}

/** Keeps Tab / Shift+Tab inside `root`. Returns true if it handled the key. */
function trapTab(e, root) {
  if (e.key !== "Tab") return false;
  const list = focusables(root);
  if (!list.length) { e.preventDefault(); return true; }
  const first = list[0], last = list[list.length - 1];
  const inside = root.contains(document.activeElement);
  if (!inside) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return true; }
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); return true; }
  if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); return true; }
  return false;
}

function defaultClickByClass(cls) {
  const el = document.querySelector("." + cls);
  const b = el && (el.matches("button, a, input") ? el : el.querySelector("button, a, input"));
  b?.click();
}

/**
 * opts: { getIndex(), setIndex(i), pointCount(), clickByClass(cls), focusWelcome = true }.
 * clickByClass gets a class name without the dot: "mm-play", "mm-follow", "mm-rings", "proof-toggle".
 * Returns { destroy() }.
 */
export function initA11y({ getIndex, setIndex, pointCount, clickByClass = defaultClickByClass, focusWelcome = true, actions = {} } = {}) {
  const cleanups = [];
  const on = (target, type, fn, opt) => { target.addEventListener(type, fn, opt); cleanups.push(() => target.removeEventListener(type, fn, opt)); };
  const addedAttrs = []; // [el, name] we set, removed again on destroy
  const setAttr = (el, name, value) => { if (!el.hasAttribute(name)) addedAttrs.push([el, name]); el.setAttribute(name, value); };

  const mapEl = document.getElementById("map");
  const panel = document.getElementById("panel");
  const slider = document.getElementById("point-slider");

  // --- live region -------------------------------------------------------------------------------------------
  const live = document.createElement("div");
  live.className = "sr-only a11y-live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  document.body.appendChild(live);
  const THROTTLE_MS = 400;
  let lastSaid = 0, pending = null, liveTimer = null;
  const say = (text) => {
    // Clear first so the same text twice ("Point 1 of 1822" after Home, Home) is read again.
    live.textContent = "";
    setTimeout(() => { live.textContent = text; }, 30);
    lastSaid = Date.now();
  };
  const announce = (text) => {
    pending = text;
    if (liveTimer) return;
    const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastSaid));
    liveTimer = setTimeout(() => { liveTimer = null; say(pending); }, wait);
  };
  cleanups.push(() => clearTimeout(liveTimer));

  const pointText = (i, n) => `Point ${i + 1} of ${n}`;
  const syncSliderText = () => {
    if (!slider) return;
    const n = Number(slider.max) + 1;
    slider.setAttribute("aria-valuetext", n > 1 ? pointText(Number(slider.value), n) : "No route");
  };
  if (slider) { on(slider, "input", syncSliderText); syncSliderText(); }

  // --- skip link ---------------------------------------------------------------------------------------------
  const skip = document.createElement("a");
  skip.className = "a11y-skip";
  skip.href = "#panel";
  skip.textContent = "Skip to side panel";
  on(skip, "click", (e) => {
    e.preventDefault();
    if (!panel) return;
    if (!panel.hasAttribute("tabindex")) setAttr(panel, "tabindex", "-1");
    panel.focus();
  });
  document.body.prepend(skip);

  // --- help dialog -------------------------------------------------------------------------------------------
  const help = document.createElement("div");
  help.className = "a11y-help-backdrop";
  help.hidden = true;
  const rows = SHORTCUTS.map((s) => `<tr><th scope="row">${s.keys.split(" / ").map((k) => k.split(" or ").map((x) => `<kbd>${x}</kbd>`).join(" or ")).join(" / ")}</th><td>${s.action}</td></tr>`).join("");
  help.innerHTML = `
    <div class="a11y-help" role="dialog" aria-modal="true" aria-labelledby="a11y-help-title" aria-describedby="a11y-help-note">
      <h2 id="a11y-help-title">Keyboard shortcuts</h2>
      <table><tbody>${rows}</tbody></table>
      <p id="a11y-help-note">Shortcuts work anywhere except in text fields and menus. When the map itself has focus, the arrow keys pan it and + / − zoom; on the route slider the arrow keys move along the route.</p>
      <button type="button" class="a11y-help-close">Close</button>
    </div>`;
  document.body.appendChild(help);
  const helpCard = help.querySelector(".a11y-help");
  const helpClose = help.querySelector(".a11y-help-close");
  let helpReturn = null;
  const helpOpen = () => !help.hidden;
  const openHelp = () => {
    helpReturn = document.activeElement;
    help.hidden = false;
    helpClose.focus();
  };
  const closeHelp = () => {
    help.hidden = true;
    if (helpReturn && helpReturn.isConnected && typeof helpReturn.focus === "function") helpReturn.focus();
    helpReturn = null;
  };
  on(helpClose, "click", closeHelp);
  on(help, "click", (e) => { if (e.target === help) closeHelp(); });

  // --- welcome dialog (welcome.js): open state, focus in, focus back -----------------------------------------
  const welcomeEl = () => document.getElementById("mw-welcome");
  const welcomeOpen = () => { const w = welcomeEl(); return !!w && !w.hidden && !w.classList.contains("out"); };
  let welcomeReturn = null;
  let welcomeWasOpen = false;
  let watchedWelcome = null; // #mw-welcome may be appended after initA11y: start watching its class when seen
  const syncWelcome = () => {
    const w = welcomeEl();
    if (!w) return;
    if (w !== watchedWelcome) { watchedWelcome = w; mo.observe(w, { attributes: true, attributeFilter: ["class", "hidden"] }); }
    const card = w.querySelector('[role="dialog"]');
    if (card && !card.hasAttribute("aria-modal")) setAttr(card, "aria-modal", "true");
    const open = welcomeOpen();
    // `.out` only fades it (opacity + visibility transition): keep its buttons out of the Tab order and the
    // accessibility tree while closed, whatever the transition does.
    if (open) w.removeAttribute("inert");
    else if (!w.hasAttribute("inert")) setAttr(w, "inert", "");
    if (open && !welcomeWasOpen) {
      welcomeReturn = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      if (focusWelcome) (w.querySelector("#mw-go") || focusables(w)[0])?.focus({ preventScroll: true });
    } else if (!open && welcomeWasOpen) {
      if (w.contains(document.activeElement)) {
        if (welcomeReturn && welcomeReturn.isConnected && !w.contains(welcomeReturn)) welcomeReturn.focus();
        else document.activeElement.blur();
      }
      welcomeReturn = null;
    }
    welcomeWasOpen = open;
  };

  // --- keyboard ----------------------------------------------------------------------------------------------
  const step = (action) => {
    const n = Number(pointCount?.()) || 0;
    if (n <= 0) return false;
    const i = Number(getIndex?.()) || 0;
    const target = { next: i + 1, prev: i - 1, next10: i + 10, prev10: i - 10, first: 0, last: n - 1 }[action];
    const j = Math.max(0, Math.min(n - 1, target));
    if (j !== i) setIndex?.(j);
    syncSliderText();
    announce(pointText(j, n));
    return true;
  };
  const TOGGLES = {
    play: { cls: "mm-play", sel: ".mm-play", say: (b) => (b.getAttribute("aria-pressed") === "true" ? "Playing" : "Paused") },
    follow: { cls: "mm-follow", sel: ".mm-follow", say: (b) => `Follow ${b.getAttribute("aria-pressed") === "true" ? "on" : "off"}` },
    rings: { cls: "mm-rings", sel: ".mm-rings", say: (b) => `Distance rings ${b.getAttribute("aria-pressed") === "true" ? "on" : "off"}` },
    proof: { cls: "proof-toggle", sel: ".proof-toggle button", say: (b) => `Proof view ${b.getAttribute("aria-pressed") === "true" ? "on" : "off"}` },
  };

  const onKeyDown = (e) => {
    // Focus traps first (Tab is not a shortcut).
    if (helpOpen() && trapTab(e, helpCard)) return;
    if (welcomeOpen()) { if (focusWelcome) trapTab(e, welcomeEl()); return; } // Escape there is welcome.js's job
    if (e.defaultPrevented) return;

    // Space on a stop card (role=button, Enter-only in stop-cards.js) or other non-native ARIA button: click it.
    if ((e.key === " " || e.key === "Spacebar") && e.target?.matches?.('.sc-card[role="button"], [role="button"][tabindex]:not(button):not(a)')) {
      if (e.target === e.target.closest('[role="button"]')) { e.preventDefault(); e.target.click(); }
      return;
    }

    const action = keyAction(e);
    if (!action) return;
    if (helpOpen()) {
      if (action === "close" || action === "help") { e.preventDefault(); closeHelp(); }
      return;
    }
    if (action === "close") return; // nothing of ours is open; let others (welcome.js tour, Leaflet popups) handle it
    if (action === "help") { e.preventDefault(); openHelp(); return; }
    if (NAV.has(action)) {
      // With the map itself focused, Leaflet pans on arrows (its own document listener); don't also step the route.
      if (mapEl && e.target === mapEl) return;
      if (step(action)) e.preventDefault();
      return;
    }
    const tg = TOGGLES[action];
    if (tg) {
      const b = document.querySelector(tg.sel);
      if (!b || b.disabled) return;
      e.preventDefault();
      clickByClass(tg.cls);
      announce(tg.say(b));
      return;
    }
    // run 2: view / layer / plan actions provided by main.js; each returns the text to announce (or nothing)
    if ((action === "zoomIn" || action === "zoomOut") && mapEl && e.target === mapEl) return;   // Leaflet zooms itself there
    const fn = actions[action];
    if (typeof fn === "function") { e.preventDefault(); const said = fn(); if (said) announce(said); }
  };
  on(document, "keydown", onKeyDown);

  // --- runtime fixes for things other modules render ---------------------------------------------------------
  if (mapEl && !mapEl.hasAttribute("aria-label") && !mapEl.hasAttribute("aria-labelledby")) {
    setAttr(mapEl, "role", "region");
    setAttr(mapEl, "aria-label", "Map of the walking area on Jezero crater. Arrow keys pan, plus and minus zoom. Press question mark for keyboard shortcuts.");
  }

  const nameIconButtons = () => {
    for (const b of document.querySelectorAll('button:not([aria-label]):not([aria-labelledby]), a[role="button"]:not([aria-label]):not([aria-labelledby])')) {
      const text = (b.textContent || "").trim();
      if (/[\p{L}\p{N}]{2,}/u.test(text)) continue; // has a readable word: fine
      const name = ICON_NAMES_BY_ID[b.id] || b.getAttribute("title") || ICON_NAMES_BY_GLYPH[text];
      if (name) setAttr(b, "aria-label", name);
    }
  };

  // Panel section headings: welcome.js folds a section when its <h2> is clicked, which a keyboard cannot reach.
  // Wrap the heading text in a <button aria-expanded> (keeps the heading for screen-reader navigation; the click
  // bubbles to welcome.js's panel listener exactly like a mouse click on the heading).
  const foldButtons = new Set();
  const wrapFoldHeadings = () => {
    if (!panel) return;
    for (const h of panel.querySelectorAll(":scope > section > h2")) {
      let b = h.querySelector(":scope > button.a11y-fold");
      if (!b) {
        if (h.querySelector("button, a, input, select")) continue; // already interactive inside: leave it alone
        b = document.createElement("button");
        b.type = "button";
        b.className = "a11y-fold";
        b.append(...h.childNodes);
        h.appendChild(b);
        foldButtons.add(b);
      }
      b.setAttribute("aria-expanded", String(!h.parentElement.classList.contains("mw-collapsed")));
    }
  };

  let scanQueued = false;
  const scan = () => {
    scanQueued = false;
    nameIconButtons();
    wrapFoldHeadings();
    syncWelcome();
  };
  const queueScan = () => { if (!scanQueued) { scanQueued = true; requestAnimationFrame(scan); } };
  const mo = new MutationObserver(queueScan);
  mo.observe(document.body, { childList: true, subtree: true });
  if (panel) mo.observe(panel, { attributes: true, attributeFilter: ["class"], subtree: true });
  cleanups.push(() => mo.disconnect());
  scan();

  return {
    destroy() {
      cleanups.forEach((fn) => fn());
      skip.remove(); help.remove(); live.remove();
      for (const b of foldButtons) { if (b.isConnected) b.replaceWith(...b.childNodes); }
      for (const [el, name] of addedAttrs) el.removeAttribute(name);
      slider?.removeAttribute("aria-valuetext");
    },
  };
}
