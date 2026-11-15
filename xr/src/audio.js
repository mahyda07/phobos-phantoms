// Written with AI assistance (Claude).
// Voice mission control (run 2, Phase 2b) + the audio bus Phase 5 plugs into. Track [P5].
// Quest Browser 157 has no speechSynthesis and no speech recognition (probe 15 Nov 2026), so callouts are fixed clips
// made offline with Windows SAPI (xr/scripts/make_voice.ps1 -> public/voice/*.mp3), played with Web Audio.
// Numbers are never spoken: they stay on the visor. The pure parts (calloutsFor, Limiter) are unit-tested.

export const STEEP_DEG = 20;          // brief: slope > 20 deg ahead
export const HAZARD_AHEAD = 0.5;      // brief: AI hazard ahead > 0.5
export const AHEAD_M = 30;            // look this far ahead along the route
export const MARGIN_WARN_MIN = 60;    // "Margin under one hour"
export const MIN_GAP_MS = 8000;       // callouts at least 8 s apart
export const SAME_LINE_MS = 30000;    // no repeat of the same line within 30 s

/**
 * Which callouts the walk state calls for (in priority order). Pure.
 * route: route.json; i: current vertex; prev: previous call's { i, margin } (or null); stopIdx: stop vertices.
 */
export function calloutsFor(route, i, prev, stopIdx = []) {
  const c = route.geometry.coordinates, pv = route.properties.per_vertex;
  const out = [];
  if (prev && stopIdx.some((v) => v > prev.i && v <= i)) out.push("stop");
  const m = pv.margin_min[i];
  if (prev && prev.margin >= MARGIN_WARN_MIN && m < MARGIN_WARN_MIN) out.push("margin");
  let d = 0, steep = false, hazard = false;
  for (let k = i + 1; k < c.length; k++) {
    d += Math.hypot(c[k][0] - c[k - 1][0], c[k][1] - c[k - 1][1]);
    if (d > AHEAD_M) break;                          // only vertices within 30 m ahead
    if (pv.slope_deg[k] > STEEP_DEG) steep = true;
    if (pv.hazard?.[k] > HAZARD_AHEAD) hazard = true;
  }
  if (hazard) out.push("hazard");
  if (steep) out.push("steep");
  return out;
}

/** Rate limiter: >= gapMs between any two lines, >= sameMs before the same line again. Pure (time passed in). */
export class Limiter {
  constructor(gapMs = MIN_GAP_MS, sameMs = SAME_LINE_MS) { this.gap = gapMs; this.same = sameMs; this.last = -Infinity; this.byLine = {}; }
  allow(line, now) {
    if (now - this.last < this.gap) return false;
    if (now - (this.byLine[line] ?? -Infinity) < this.same) return false;
    this.last = now; this.byLine[line] = now; return true;
  }
}

const MUTE_KEY = "marswalk-muted";
function readMuted() { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } }
function writeMuted(v) { try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch { /* storage blocked: session only */ } }

/** Web Audio bus: master (mute) -> voice / sfx / ambience gains. Unlocks on the first user gesture. */
export function createAudio({ base = "./voice/" } = {}) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  let ctx = null, master, voiceGain, sfxGain, ambGain;
  let muted = readMuted();
  const buffers = {}, listeners = new Set();
  let lastLine = null;
  const limiter = new Limiter();

  function ensure() {
    if (ctx || !AC) return ctx;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
    voiceGain = ctx.createGain(); voiceGain.gain.value = 1; voiceGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.126; sfxGain.connect(master);    // -18 dB relative to voice
    ambGain = ctx.createGain(); ambGain.gain.value = 0.18; ambGain.connect(master);
    return ctx;
  }
  async function load(name) {
    if (buffers[name] || !ensure()) return buffers[name];
    try {
      const r = await fetch(base + name + ".mp3");
      buffers[name] = await ctx.decodeAudioData(await r.arrayBuffer());
    } catch { buffers[name] = null; }
    return buffers[name];
  }
  async function play(name, { force = false } = {}) {
    if (!force && !limiter.allow(name, performance.now())) return false;
    lastLine = name;
    listeners.forEach((f) => f({ type: "line", name }));
    if (muted || !ensure()) return true;
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* needs a gesture */ } }
    const buf = await load(name);
    (globalThis.__mwlog ||= []).push({ t: Math.round(performance.now()), ev: "play", name, ctx: ctx.state, buf: !!buf });
    if (!buf) return false;
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(voiceGain); src.start();
    return true;
  }
  const unlock = () => { ensure(); if (ctx?.state === "suspended") ctx.resume().catch(() => {}); };
  addEventListener("pointerdown", unlock, { once: true });
  addEventListener("keydown", unlock, { once: true });

  return {
    get ctx() { return ensure(); }, get sfx() { ensure(); return sfxGain; }, get ambience() { ensure(); return ambGain; },
    unlock, play,
    // rate-limited callout; returns true/false synchronously (whether the line was allowed), plays in the background
    say(name) { if (!limiter.allow(name, performance.now())) return false; play(name, { force: true }); return true; },
    repeat: () => (lastLine ? play(lastLine, { force: true }) : Promise.resolve(false)),
    preload: (names) => Promise.all(names.map(load)),
    get muted() { return muted; },
    setMuted(v) { muted = !!v; writeMuted(muted); if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02); listeners.forEach((f) => f({ type: "mute", muted })); },
    toggleMute() { this.setMuted(!muted); return muted; },
    on(f) { listeners.add(f); return () => listeners.delete(f); },
    get lastLine() { return lastLine; },
  };
}

export const VOICE_LINES = ["steep", "hazard", "stop", "margin", "home", "home-offline", "waking", "walk"];

// ---------- run 2 Phase 5: synthesized UI sounds (no downloaded sfx packs) ----------
/** Note recipes: [frequency Hz, start s, duration s, wave]. Short, soft, distinct. Pure data (tested). */
export const SFX = {
  click: [[880, 0, 0.05, "triangle"]],
  route: [[523.25, 0, 0.12, "sine"], [659.25, 0.1, 0.12, "sine"], [783.99, 0.2, 0.2, "sine"]],
  stop: [[659.25, 0, 0.18, "sine"], [987.77, 0.12, 0.3, "sine"]],
  warning: [[440, 0, 0.14, "square"], [440, 0.22, 0.14, "square"]],
  home: [[392, 0, 0.14, "sine"], [523.25, 0.12, 0.14, "sine"], [659.25, 0.24, 0.32, "sine"]],
};
/** Plays a recipe into `dest` (the -18 dB sfx bus). Each note has a 5 ms attack and an exponential release. */
export function playSfx(ctx, dest, name, at = ctx.currentTime) {
  for (const [f, t0, d, type] of SFX[name] || []) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at + t0);
    g.gain.exponentialRampToValueAtTime(type === "square" ? 0.25 : 0.6, at + t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + t0 + d);
    o.connect(g).connect(dest); o.start(at + t0); o.stop(at + t0 + d + 0.02);
  }
}
/** Real Mars wind (Perseverance SuperCam sol 4, NASA/JPL-Caltech/LANL/CNES/CNRS/ISAE-Supaero), seamless 37 s loop. */
export async function startAmbience(bus, url = "./audio/mars-wind-loop.mp3", fadeS = 3) {
  const ctx = bus.ctx; if (!ctx) return null;
  if (bus._amb) return bus._amb;
  try {
    const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fadeS);
    src.connect(g).connect(bus.ambience); src.start();
    bus._amb = { src, g };
    return bus._amb;
  } catch { return null; }
}
export function stopAmbience(bus, fadeS = 1) {
  const a = bus._amb; if (!a) return; bus._amb = null;
  const ctx = bus.ctx; a.g.gain.setTargetAtTime(0.0001, ctx.currentTime, fadeS / 3); a.src.stop(ctx.currentTime + fadeS + 0.1);
}
