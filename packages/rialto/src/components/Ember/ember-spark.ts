/**
 * Pure maths behind the Ember sparks — no DOM, no canvas.
 *
 * Kept separate from the engine so the spark motion can be reasoned about and
 * tested in isolation from the render loop. Every spark is a deterministic
 * function of its index and the clock, so no random state is held anywhere.
 */

export interface SparkSeed {
  /** Horizontal home position as a fraction of the width, `[0, 1)`. */
  readonly x: number;
  /** Starting point in the rise cycle, `[0, 1)`. */
  readonly offset: number;
  /** Rise cycles per second. */
  readonly speed: number;
  /** Spark radius in CSS pixels. */
  readonly radius: number;
  /** Sideways wander amplitude as a fraction of the width. */
  readonly sway: number;
  /** Flicker phase in radians. */
  readonly flickerPhase: number;
}

export interface Push {
  readonly x: number;
  readonly y: number;
}

export const SPARK_COUNT = 120;
/** Every Nth spark is a gold one: 1 in 20 is the hottest 5%. */
export const GOLD_EVERY = 20;

/** How far from the pointer, in CSS pixels, a spark still feels the draft. */
const DRAFT_RADIUS = 120;
/** Peak displacement, in CSS pixels, of a spark right at the pointer. */
const DRAFT_STRENGTH = 70;

const MAX_SWAY = 0.04;
const FLICKER_RATE = 9;
const FLICKER_FLOOR = 0.55;

/** A stable pseudo-random value in `[0, 1)` for `(index, channel)`. */
function hash(index: number, channel: number): number {
  const raw = Math.sin(index * 127.1 + channel * 311.7) * 43758.5453;
  return raw - Math.floor(raw);
}

export function sparkSeed(index: number): SparkSeed {
  return {
    x: hash(index, 1),
    offset: hash(index, 2),
    speed: 0.05 + hash(index, 3) * 0.09,
    radius: 0.8 + hash(index, 4) * 1.6,
    sway: 0.3 + hash(index, 5) * 0.7,
    flickerPhase: hash(index, 6) * Math.PI * 2,
  };
}

export function isGoldSpark(index: number): boolean {
  return index % GOLD_EVERY === 0;
}

/** How far up its life a spark is at `time` seconds: 0 at the hearth, near 1 at the top. */
export function riseProgress(seed: SparkSeed, time: number): number {
  const raw = seed.offset + time * seed.speed;
  return raw - Math.floor(raw);
}

/** Brightness by height: fully lit at the hearth, gone at the top. */
export function fadeAlpha(progress: number): number {
  const remaining = Math.min(1, Math.max(0, 1 - progress));
  return remaining * remaining;
}

/** A candle-like brightness multiplier in `[FLICKER_FLOOR, 1]`. */
export function flicker(seed: SparkSeed, time: number): number {
  const wave = 0.5 + 0.5 * Math.sin(time * FLICKER_RATE + seed.flickerPhase);
  return FLICKER_FLOOR + (1 - FLICKER_FLOOR) * wave;
}

/** Sideways wander in `[-1, 1]` times the spark's own amplitude, by height. */
export function swayOffset(seed: SparkSeed, progress: number): number {
  return Math.sin(progress * Math.PI * 4 + seed.flickerPhase) * seed.sway;
}

/** Horizontal wander as a fraction of the container width. */
export const SWAY_SPAN = MAX_SWAY;

/**
 * The displacement the pointer's draft gives a spark at `(x, y)`. Blows the
 * spark directly away from the pointer, strongest beside it and tapering
 * linearly to nothing at `DRAFT_RADIUS`. A pointer that never entered pushes
 * nothing.
 */
export function draftPush(x: number, y: number, pointerX: number, pointerY: number): Push {
  const dx = x - pointerX;
  const dy = y - pointerY;
  const distance = Math.hypot(dx, dy);
  if (!(distance < DRAFT_RADIUS)) return { x: 0, y: 0 };
  const force = (1 - distance / DRAFT_RADIUS) * DRAFT_STRENGTH;
  // A spark exactly on the pointer has no direction; send it straight up the draft.
  if (distance === 0) return { x: 0, y: -force };
  return { x: (dx / distance) * force, y: (dy / distance) * force };
}
