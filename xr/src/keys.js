// Written with AI assistance (Claude).
// Keyboard map for the headset page's desktop preview + the help overlay (run 2, Phase 2e). Track [P5].
// keyAction() is pure (unit-tested in walk.test.mjs); initKeys() wires it to the page.

/** Keyboard and controller bindings, as shown in the help overlay. One source for both. */
export const BINDINGS = [
  { keys: ["W", "↑"], pad: "Right stick up", what: "Walk: step forward along the route · Desk: zoom in" },
  { keys: ["S", "↓"], pad: "Right stick down", what: "Walk: step back · Desk: zoom out" },
  { keys: ["A", "D", "←", "→"], pad: "Turn your head (walk) · ⟲ ⟳ panel buttons (desk)", what: "Turn the view (walk) / rotate the hologram (desk)" },
  { keys: ["Space"], pad: "Walk panel: Pause", what: "Pause or play the walk" },
  { keys: ["H"], pad: "Hold A for 1 s", what: "Get me home: plan a return route to the walk's start" },
  { keys: ["G"], pad: "B", what: "Show or hide Perseverance's real path (ghost rover)" },
  { keys: ["M"], pad: "X", what: "Mute or unmute voice and sounds" },
  { keys: ["V"], pad: "Y", what: "Repeat the last voice callout" },
  { keys: ["?"], pad: "", what: "This help (the ? button on the page opens the guide)" },
  { keys: ["Esc"], pad: "", what: "Close help / panels" },
  { keys: [], pad: "Trigger or pinch", what: "Place the hologram, press a button" },
  { keys: [], pad: "Pinch and drag · two hands", what: "Move · scale the hologram" },
];

const MAP = {
  w: "forward", arrowup: "forward", s: "back", arrowdown: "back",
  a: "left", arrowleft: "left", d: "right", arrowright: "right",
  " ": "pause", h: "home", g: "ghost", m: "mute", v: "repeat", "?": "help", escape: "close",
};

/** Action name for a keydown event, or null. Ignores typing in inputs and shortcuts with Ctrl/Alt/Meta. Pure. */
export function keyAction(e) {
  if (!e || e.ctrlKey || e.altKey || e.metaKey) return null;
  const tag = String(e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return null;
  const k = String(e.key || "").toLowerCase();
  if (k === "/" && e.shiftKey) return "help";            // '?' on layouts that report the base key
  return MAP[k] || null;
}

/** Help overlay markup (keyboard AND controller). Pure string, escaped. */
export function helpHtml(bindings = BINDINGS) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const rows = bindings.map((b) => `<tr><td>${b.keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(" ") || "–"}</td><td>${esc(b.pad) || "–"}</td><td>${esc(b.what)}</td></tr>`).join("");
  return `<div class="help-card glass" role="dialog" aria-modal="true" aria-labelledby="help-title">
    <h2 id="help-title">Keyboard and controller</h2>
    <table><thead><tr><th>Keyboard</th><th>Quest controller / hands</th><th>What it does</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="help-foot">Close with <kbd>Esc</kbd> or <kbd>?</kbd></p></div>`;
}

/** Wire keys to `actions` ({forward, back, left, right, pause, home, ghost, mute, repeat}). Adds the help overlay. */
export function initKeys(actions) {
  const overlay = document.createElement("div");
  overlay.id = "help"; overlay.hidden = true; overlay.innerHTML = helpHtml();
  document.body.appendChild(overlay);
  let lastFocus = null;
  const setHelp = (on) => {
    if (on === !overlay.hidden) return;
    overlay.hidden = !on;
    if (on) { lastFocus = document.activeElement; overlay.querySelector(".help-card").setAttribute("tabindex", "-1"); overlay.querySelector(".help-card").focus(); }
    else lastFocus?.focus?.();
  };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) setHelp(false); });
  addEventListener("keydown", (e) => {
    const a = keyAction(e);
    if (!a) return;
    if (a === "help") { e.preventDefault(); setHelp(overlay.hidden); return; }
    if (a === "close") { if (!overlay.hidden) { e.preventDefault(); setHelp(false); } return; }
    if (!overlay.hidden) return;                       // help open: other keys do nothing
    if (a === "pause" || a.startsWith("arrow") || ["forward", "back", "left", "right"].includes(a)) e.preventDefault();
    actions[a]?.();
  });
  return { setHelp, isOpen: () => !overlay.hidden };
}
