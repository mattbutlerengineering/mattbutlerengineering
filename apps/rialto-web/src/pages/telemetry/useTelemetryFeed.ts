/**
 * Telemetry feed — a deterministic stand-in for a live race feed.
 *
 * The HUD demo needs motion that looks like data without depending on any
 * data. Every frame is a pure function of `(seed, index)`, so the same seed
 * replays the same session exactly — which is what makes `?frozen=1`
 * screenshot-stable rather than merely slow-moving.
 *
 * The clock is the frame index times the interval, never `Date.now()`. A
 * wall-clock reading would make every frozen screenshot differ from the last
 * and every test depend on when it ran.
 */

import { useEffect, useMemo, useState } from "react";

/* ── Types ───────────────────────────────────── */

export interface TelemetryZone {
  id: string;
  zone: string;
  /** km/h on the current pass. */
  speed: number;
  /** km/h, session best for this zone. */
  best: number;
  /** `speed - best` — negative is off the pace. */
  delta: number;
}

export interface TelemetryVitals {
  /** All 0–1. */
  throttle: number;
  brake: number;
  fuel: number;
  tyreFL: number;
  tyreFR: number;
}

export interface TelemetryFrame {
  /** ms since session start, derived from the frame index. */
  t: number;
  lap: number;
  totalLaps: number;
  position: number;
  zones: TelemetryZone[];
  /** Drives the live row highlight. */
  activeZoneId: string;
  vitals: TelemetryVitals;
  /** Newest first. */
  events: Array<{ t: number; label: string }>;
}

export type FeedState =
  | { kind: "connecting" }
  | { kind: "empty" }
  | { kind: "live"; frame: TelemetryFrame }
  | { kind: "hold"; frame: TelemetryFrame }
  | { kind: "stale"; frame: TelemetryFrame; since: number };

export interface TelemetryFeedOptions {
  seed: number;
  /** Pin the feed to one frame — `?frozen=1`, and every visual baseline. */
  frozen: boolean;
  intervalMs?: number;
  /** `false` yields `empty`: the HUD chrome with no session behind it. */
  started?: boolean;
  /** `true` yields `hold`: the last frame, retained deliberately. */
  paused?: boolean;
  /** `true` yields `stale`: the last frame, retained because nothing newer came. */
  degraded?: boolean;
}

/* ── Session data ────────────────────────────── */

const DEFAULT_INTERVAL_MS = 800;
const FRAMES_PER_LAP = 8;
const TOTAL_LAPS = 12;
const MAX_EVENTS = 5;

/** Zone layout and session bests, shared with the `/demos/dashboard` mock. */
const ZONES: ReadonlyArray<{ id: string; zone: string; best: number }> = [
  { id: "z1", zone: "Pit Exit", best: 84 },
  { id: "z2", zone: "Turn 1 Entry", best: 268 },
  { id: "z3", zone: "Turn 1 Apex", best: 139 },
  { id: "z4", zone: "Back Straight", best: 315 },
  { id: "z5", zone: "Chicane Entry", best: 195 },
  { id: "z6", zone: "Chicane Exit", best: 171 },
  { id: "z7", zone: "Turn 7 Apex", best: 106 },
  { id: "z8", zone: "Main Straight", best: 331 },
];

const EVENT_LABELS = [
  "Sector purple",
  "DRS enabled",
  "Yellow flag cleared",
  "Tyre temp nominal",
  "Fuel mix 2",
  "Traction control trim",
];

/** mulberry32 — small, fast, and stable across engines. */
function randomFrom(state: number): () => number {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes seed and index so neighbouring seeds do not share frame streams. */
function mix(seed: number, index: number): number {
  return (Math.imul(seed, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
}

/**
 * The frame at `index` of the session identified by `seed`. Pure — no clock,
 * no accumulated state, so any frame can be produced on its own.
 */
export function telemetryFrame(
  seed: number,
  index: number,
  intervalMs: number = DEFAULT_INTERVAL_MS
): TelemetryFrame {
  const random = randomFrom(mix(seed, index));

  const zones = ZONES.map(({ id, zone, best }) => {
    const speed = Math.round(best * (0.96 + random() * 0.06));
    return { id, zone, speed, best, delta: speed - best };
  });

  const activeZone = ZONES[index % ZONES.length];
  const wear = Math.min(1, index / (FRAMES_PER_LAP * TOTAL_LAPS));

  const events = Array.from({ length: Math.min(MAX_EVENTS, index + 1) }, (_, back) => {
    const at = index - back;
    return {
      t: at * intervalMs,
      label: EVENT_LABELS[mix(seed, at) % EVENT_LABELS.length] ?? EVENT_LABELS[0]!,
    };
  });

  return {
    t: index * intervalMs,
    lap: Math.min(TOTAL_LAPS, 1 + Math.floor(index / FRAMES_PER_LAP)),
    totalLaps: TOTAL_LAPS,
    position: 1 + (mix(seed, Math.floor(index / FRAMES_PER_LAP)) % 8),
    zones,
    activeZoneId: activeZone?.id ?? "z1",
    vitals: {
      throttle: Number(random().toFixed(3)),
      brake: Number((random() * 0.4).toFixed(3)),
      fuel: Number(Math.max(0, 1 - wear * 0.85).toFixed(3)),
      tyreFL: Number(Math.max(0, 1 - wear * 0.6).toFixed(3)),
      tyreFR: Number(Math.max(0, 1 - wear * 0.65).toFixed(3)),
    },
    events,
  };
}

/* ── Hook ────────────────────────────────────── */

/**
 * Resolves the feed state for the HUD.
 *
 * The first frame lands one interval in, so `connecting` is a real state the
 * route renders rather than a flash — the frame it draws is the same frame
 * `live` draws, which is what keeps the layout from shifting underneath it.
 */
export function useTelemetryFeed({
  seed,
  frozen,
  intervalMs = DEFAULT_INTERVAL_MS,
  started = true,
  paused = false,
  degraded = false,
}: TelemetryFeedOptions): FeedState {
  // `null` means no frame has arrived yet.
  const [index, setIndex] = useState<number | null>(frozen ? 0 : null);

  const ticking = started && !frozen && !paused && !degraded;

  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => {
      setIndex((current) => (current === null ? 1 : current + 1));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [ticking, intervalMs]);

  const frame = useMemo(
    () => (index === null ? null : telemetryFrame(seed, index, intervalMs)),
    [seed, index, intervalMs]
  );

  if (!started) return { kind: "empty" };
  if (frame === null) return { kind: "connecting" };
  if (degraded) return { kind: "stale", frame, since: frame.t };
  if (paused) return { kind: "hold", frame };
  return { kind: "live", frame };
}
