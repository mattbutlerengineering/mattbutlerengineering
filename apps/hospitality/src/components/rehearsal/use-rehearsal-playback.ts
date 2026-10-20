import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { eventIndexAt } from "./rehearsal-state";
import type { RehearsalEvent } from "./simulate-service";
import type { PlaybackSpeed } from "./should-announce";

export interface RehearsalPlaybackOptions {
  readonly openMinute: number;
  readonly closeMinute: number;
  readonly reducedMotion: boolean;
}

export interface RehearsalPlayback {
  /** Committed simulated minute, quantized to a quarter minute. */
  readonly minute: number;
  readonly eventIndex: number;
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
  readonly atEnd: boolean;
  readonly play: () => void;
  readonly pause: () => void;
  readonly setSpeed: (speed: PlaybackSpeed) => void;
  /** Jumps to a minute and pauses; call `releaseScrub` when the pointer lets go. */
  readonly scrubTo: (minute: number) => void;
  readonly releaseScrub: () => void;
  readonly stepEvent: (direction: 1 | -1) => void;
  readonly restart: () => void;
}

/** Simulated minutes per real second at 1x: speed N means N simulated seconds per real second. */
const SECONDS_PER_MINUTE = 60;
/** A hidden tab must not fast-forward the night past events the owner never saw. */
const MAX_FRAME_GAP_MS = 250;
const QUANTUM_MINUTES = 0.25;
const SLOW_COMMIT_MS = 50;
/** 16 commits per second is the natural rate at 240x; the floor is 4 per second. */
const NATURAL_COMMIT_INTERVAL_MS = 62.5;
const MAX_COMMIT_INTERVAL_MS = 250;
const REDUCED_TICK_MS = 1000;
const REDUCED_TICK_MINUTES = 15;
const DEFAULT_SPEED: PlaybackSpeed = 60;

const quantize = (minute: number): number => Math.floor(minute / QUANTUM_MINUTES) * QUANTUM_MINUTES;

/**
 * The rehearsal clock and nothing else. The exact minute lives in a ref; only a quantized value is
 * committed to state, so a commit that crosses no event re-renders little. State is a pure
 * function of the minute, so a coarser commit rate changes how often the screen refreshes, never
 * what is true.
 */
export function useRehearsalPlayback(
  events: readonly RehearsalEvent[],
  { openMinute, closeMinute, reducedMotion }: RehearsalPlaybackOptions
): RehearsalPlayback {
  const [minute, setMinute] = useState(openMinute);
  const [playing, setPlaying] = useState(!reducedMotion);
  const [speed, setSpeed] = useState<PlaybackSpeed>(DEFAULT_SPEED);

  const exactRef = useRef(openMinute);
  const committedRef = useRef(openMinute);
  const lastCommitTsRef = useRef(Number.NEGATIVE_INFINITY);
  const minIntervalRef = useRef(0);
  const commitStartRef = useRef<number | null>(null);
  const scrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);

  const commit = useCallback((exact: number, force: boolean, ts: number) => {
    const next = quantize(exact);
    if (next === committedRef.current) return;
    if (!force && ts - lastCommitTsRef.current < minIntervalRef.current) return;
    committedRef.current = next;
    lastCommitTsRef.current = ts;
    commitStartRef.current = performance.now();
    setMinute(next);
  }, []);

  // Measures how long a commit took to reach the DOM and halves the commit rate when it is slow.
  useLayoutEffect(() => {
    if (commitStartRef.current === null) return;
    const took = performance.now() - commitStartRef.current;
    commitStartRef.current = null;
    if (took > SLOW_COMMIT_MS) {
      minIntervalRef.current = Math.min(
        MAX_COMMIT_INTERVAL_MS,
        (minIntervalRef.current || NATURAL_COMMIT_INTERVAL_MS) * 2
      );
    }
  }, [minute]);

  const jumpTo = useCallback(
    (target: number) => {
      const clamped = Math.min(Math.max(target, openMinute), closeMinute);
      exactRef.current = clamped;
      commit(clamped, true, 0);
    },
    [commit, openMinute, closeMinute]
  );

  // Animation-frame clock (normal motion).
  useEffect(() => {
    if (!playing || reducedMotion) return;
    let frameId = 0;
    let lastTs: number | null = null;
    const tick = (ts: number) => {
      const gap = lastTs === null ? 0 : Math.min(ts - lastTs, MAX_FRAME_GAP_MS);
      lastTs = ts;
      exactRef.current = Math.min(
        closeMinute,
        exactRef.current + ((gap / 1000) * speed) / SECONDS_PER_MINUTE
      );
      if (exactRef.current >= closeMinute) {
        commit(closeMinute, true, ts);
        setPlaying(false);
        return;
      }
      commit(exactRef.current, false, ts);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, reducedMotion, speed, closeMinute, commit]);

  // Reduced-motion clock: a deliberate, user-initiated jump once per second, no animation frame.
  useEffect(() => {
    if (!playing || !reducedMotion) return;
    const timer = setInterval(() => {
      exactRef.current = Math.min(closeMinute, exactRef.current + REDUCED_TICK_MINUTES);
      commit(exactRef.current, true, 0);
      if (exactRef.current >= closeMinute) setPlaying(false);
    }, REDUCED_TICK_MS);
    return () => clearInterval(timer);
  }, [playing, reducedMotion, closeMinute, commit]);

  const restart = useCallback(() => {
    scrubbingRef.current = false;
    jumpTo(openMinute);
    setPlaying(!reducedMotion);
  }, [jumpTo, openMinute, reducedMotion]);

  const play = useCallback(() => {
    if (exactRef.current >= closeMinute) {
      restart();
      return;
    }
    setPlaying(true);
  }, [closeMinute, restart]);

  const pause = useCallback(() => setPlaying(false), []);

  const scrubTo = useCallback(
    (target: number) => {
      if (!scrubbingRef.current) {
        scrubbingRef.current = true;
        wasPlayingRef.current = playing;
      }
      setPlaying(false);
      jumpTo(target);
    },
    [jumpTo, playing]
  );

  const releaseScrub = useCallback(() => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    if (wasPlayingRef.current && exactRef.current < closeMinute) setPlaying(true);
  }, [closeMinute]);

  const stepEvent = useCallback(
    (direction: 1 | -1) => {
      const times = [...new Set(events.map((e) => e.at))];
      const here = exactRef.current;
      const target =
        direction === 1 ? times.find((t) => t > here) : [...times].reverse().find((t) => t < here);
      setPlaying(false);
      jumpTo(target ?? (direction === 1 ? here : openMinute));
    },
    [events, jumpTo, openMinute]
  );

  const eventIndex = useMemo(() => eventIndexAt(events, minute), [events, minute]);

  return {
    minute,
    eventIndex,
    playing,
    speed,
    atEnd: minute >= closeMinute,
    play,
    pause,
    setSpeed,
    scrubTo,
    releaseScrub,
    stepEvent,
    restart,
  };
}
