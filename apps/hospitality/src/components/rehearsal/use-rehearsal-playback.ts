import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { rehearsalStateAt } from "./rehearsal-state.js";
import type { RehearsalState, RehearsalStateOptions } from "./rehearsal-state.js";
import type { RehearsalEvent } from "./types.js";

export type RehearsalSpeed = 15 | 60 | 240;

export const REHEARSAL_SPEEDS: readonly RehearsalSpeed[] = [15, 60, 240];

const DEFAULT_SPEED: RehearsalSpeed = 60;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function reducedMotionSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

export interface RehearsalPlayback {
  /** Simulated time, minutes since midnight. */
  time: number;
  /** First and last event times; the clock never leaves this window. */
  start: number;
  end: number;
  playing: boolean;
  speed: RehearsalSpeed;
  /** True under prefers-reduced-motion: `play` is inert, use `step`. */
  reducedMotion: boolean;
  state: RehearsalState;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: RehearsalSpeed) => void;
  scrub: (time: number) => void;
  /** Jump to the next event time (the only way to move under reduced motion). */
  step: () => void;
}

/**
 * Playback clock over a rehearsal event log. Speeds are simulated-time multiples, so
 * 60x is one simulated minute per real second. `state` is recomputed once per whole
 * simulated minute, not per frame.
 */
export function useRehearsalPlayback(
  events: readonly RehearsalEvent[],
  options: RehearsalStateOptions = {}
): RehearsalPlayback {
  const start = events.length ? events[0]!.at : 0;
  const end = events.length ? events[events.length - 1]!.at : 0;
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => false
  );

  const [time, setTime] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<RehearsalSpeed>(DEFAULT_SPEED);
  const timeRef = useRef(time);

  const clamp = useCallback((t: number) => Math.min(end, Math.max(start, t)), [start, end]);
  const moveTo = useCallback(
    (t: number) => {
      timeRef.current = clamp(t);
      setTime(timeRef.current);
    },
    [clamp]
  );

  const running = playing && !reducedMotion;
  useEffect(() => {
    if (!running) return;
    let last: number | null = null;
    let frame = requestAnimationFrame(function tick(now) {
      if (last !== null) moveTo(timeRef.current + ((now - last) / 1000) * (speed / 60));
      last = now;
      if (timeRef.current >= end) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running, speed, end, moveTo]);

  const step = useCallback(() => {
    const next = events.find((e) => e.at > timeRef.current);
    moveTo(next ? next.at : end);
  }, [events, end, moveTo]);

  const minute = Math.floor(time);
  const { date, tableIds } = options;
  const state = useMemo(
    () => rehearsalStateAt(events, minute, { date, tableIds }),
    [events, minute, date, tableIds]
  );

  return {
    time,
    start,
    end,
    playing: running,
    speed,
    reducedMotion,
    state,
    play: useCallback(() => setPlaying(true), []),
    pause: useCallback(() => setPlaying(false), []),
    setSpeed,
    scrub: moveTo,
    step,
  };
}
