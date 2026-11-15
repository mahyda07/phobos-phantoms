// Written with AI assistance (Claude).
// Web map sound (run 2, Phase 5): OFF by default. Header toggle + key M. When on: the real Mars wind ambience
// (Perseverance SuperCam sol 4, NASA/JPL-Caltech/LANL/CNES/CNRS/ISAE-Supaero; seamless 37 s loop, low volume) and
// tiny synthesized UI sounds (same recipes as the headset, xr/src/audio.js SFX) at -18 dB. No music.
// The choice is remembered in localStorage (try/catch). Pure parts (SFX, readSoundOn) are unit-tested. Track [P3].

export const SFX = {
  click: [[880, 0, 0.05, "triangle"]],
  route: [[523.25, 0, 0.12, "sine"], [659.25, 0.1, 0.12, "sine"], [783.99, 0.2, 0.2, "sine"]],
  stop: [[659.25, 0, 0.18, "sine"], [987.77, 0.12, 0.3, "sine"]],
  warning: [[440, 0, 0.14, "square"], [440, 0.22, 0.14, "square"]],
  home: [[392, 0, 0.14, "sine"], [523.25, 0.12, 0.14, "sine"], [659.25, 0.24, 0.32, "sine"]],
};
export const SFX_GAIN = 0.126;   // -18 dB
export const AMB_GAIN = 0.16;
const KEY = "marswalk-map-sound";

/** Stored choice: "1" = on; anything else (or blocked storage) = off. */
export function readSoundOn(storage = globalThis.localStorage) { try { return storage?.getItem(KEY) === "1"; } catch { return false; } }
function writeSoundOn(on, storage = globalThis.localStorage) { try { storage?.setItem(KEY, on ? "1" : "0"); } catch { /* session only */ } }

export function initSound({ button, url = "./audio/mars-wind-loop.mp3" } = {}) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  let ctx = null, master, sfxBus, ambBus, amb = null, on = readSoundOn();
  const ensure = () => {
    if (ctx || !AC) return ctx;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_GAIN; sfxBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = AMB_GAIN; ambBus.connect(master);
    return ctx;
  };
  async function startAmb() {
    if (amb || !ensure()) return;
    try {
      const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      if (!on || amb) return;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2.5);
      src.connect(g).connect(ambBus); src.start(); amb = { src, g };
    } catch { /* no ambience: the map works without it */ }
  }
  function stopAmb() { if (!amb) return; const a = amb; amb = null; a.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25); a.src.stop(ctx.currentTime + 1); }
  function play(name) {
    if (!on || !ensure()) return;
    const at = ctx.currentTime;
    for (const [f, t0, d, type] of SFX[name] || []) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at + t0); g.gain.exponentialRampToValueAtTime(type === "square" ? 0.25 : 0.6, at + t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, at + t0 + d);
      o.connect(g).connect(sfxBus); o.start(at + t0); o.stop(at + t0 + d + 0.02);
    }
  }
  const paint = () => { if (!button) return; button.setAttribute("aria-pressed", String(on)); button.querySelector(".sound-label").textContent = on ? "Sound on" : "Sound off"; };
  function set(v) {
    on = !!v; writeSoundOn(on); paint();
    if (on) { ensure(); ctx?.resume?.(); startAmb(); play("click"); } else stopAmb();
    return on;
  }
  // autoplay rules: even when the stored choice is "on", start only after the first user gesture
  if (on) addEventListener("pointerdown", () => { if (on) { ensure(); ctx?.resume?.(); startAmb(); } }, { once: true });
  button?.addEventListener("click", () => set(!on));
  paint();
  return { get on() { return on; }, set, toggle: () => set(!on), play };
}
