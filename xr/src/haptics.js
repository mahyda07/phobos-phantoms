// Written with AI assistance (Claude).
// Haptic hazard (run 2, Phase 2c): while walking, a short controller pulse when the ground under the walker has
// AI hazard > 0.5 or slope > 20 deg. At most every 700 ms. Off switch on the walk panel (remembered). Track [P5].
export const BUZZ_HAZARD = 0.5, BUZZ_SLOPE = 20, BUZZ_EVERY_MS = 700, BUZZ_STRENGTH = 0.4, BUZZ_MS = 60;

/** Should we pulse now? Pure. state: walkState() result; lastMs: time of the last pulse. */
export function shouldBuzz(state, now, lastMs, enabled = true) {
  if (!enabled || !state) return false;
  const rough = (state.hazard ?? 0) > BUZZ_HAZARD || (state.slope_deg ?? 0) > BUZZ_SLOPE;
  return rough && now - lastMs >= BUZZ_EVERY_MS;
}

/** Pulse every controller that can (feature-detected: hapticActuators[0].pulse, else vibrationActuator). */
export function pulseAll(session) {
  let n = 0;
  for (const src of session?.inputSources || []) {
    const gp = src.gamepad;
    if (!gp) continue;
    const h = gp.hapticActuators?.[0];
    if (h?.pulse) { h.pulse(BUZZ_STRENGTH, BUZZ_MS).catch?.(() => {}); n++; continue; }
    const v = gp.vibrationActuator;
    if (v?.playEffect) { v.playEffect("dual-rumble", { duration: BUZZ_MS, strongMagnitude: BUZZ_STRENGTH, weakMagnitude: BUZZ_STRENGTH }).catch?.(() => {}); n++; }
  }
  return n;
}

const KEY = "marswalk-haptics";
export function hapticsEnabled() { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } }
export function setHapticsEnabled(on) { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* session only */ } }
