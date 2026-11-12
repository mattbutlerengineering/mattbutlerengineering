/**
 * Arrival chime for the host stand: a per-device mute setting (localStorage)
 * and a synthesized two-note tone (Web Audio — no audio asset, no dependency).
 *
 * `playArrivalChime` never throws and never leaves a rejected promise: browsers
 * block audio before a user gesture, and an SSE handler must survive that.
 */

export const ARRIVAL_CHIME_MUTED_KEY = "mbe-hospitality-arrival-chime-muted";

const listeners = new Set<() => void>();

/** True when this device has muted the arrival chime. Unreadable storage = not muted. */
export function isArrivalChimeMuted(): boolean {
  try {
    return localStorage.getItem(ARRIVAL_CHIME_MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Storage unavailable (private mode / quota) means the choice can't persist: report it. */
function persistMuted(muted: boolean): boolean {
  try {
    localStorage.setItem(ARRIVAL_CHIME_MUTED_KEY, String(muted));
    return true;
  } catch {
    return false;
  }
}

/** Returns whether the choice was persisted; subscribers are notified either way. */
export function setArrivalChimeMuted(muted: boolean): boolean {
  const persisted = persistMuted(muted);
  for (const listener of listeners) listener();
  return persisted;
}

/** Subscribe to mute changes (same tab via setArrivalChimeMuted, other tabs via `storage`). */
export function subscribeArrivalChimeMuted(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ARRIVAL_CHIME_MUTED_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/* ── Tone ──────────────────────────────────────────────────────── */

const NOTES: readonly { readonly hz: number; readonly offset: number }[] = [
  { hz: 880, offset: 0 },
  { hz: 1318.5, offset: 0.16 },
];
const NOTE_SECONDS = 0.28;
const PEAK_GAIN = 0.2;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  const Ctor: typeof AudioContext | undefined =
    typeof AudioContext === "undefined" ? undefined : AudioContext;
  if (!Ctor) return null;
  audioContext = new Ctor();
  return audioContext;
}

/** Test seam: drop the shared context so each test builds its own. */
export function resetArrivalChimeAudioForTests(): void {
  audioContext = null;
}

/** Play the chime; returns false (never throws) when audio is unavailable or blocked. */
export function playArrivalChime(): boolean {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }
    const start = ctx.currentTime;
    for (const { hz, offset } of NOTES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(hz, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + NOTE_SECONDS);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + NOTE_SECONDS);
    }
    return true;
  } catch {
    return false; // blocked or unsupported audio must never break the SSE handler
  }
}
