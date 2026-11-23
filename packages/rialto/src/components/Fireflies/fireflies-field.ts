/**
 * Pure maths behind the Fireflies backdrop — no DOM, no canvas.
 *
 * A fixed pool of flies lives in typed arrays, so the frame loop never
 * allocates per fly: it only rewrites numbers in place.
 */

/** Cap on flies so a huge canvas stays cheap: the per-frame work is bounded. */
export const FLY_COUNT_MAX = 60;

/** One fly per this many square CSS pixels, until the cap: sparse on purpose. */
const AREA_PER_FLY = 10000;

/** Every Nth fly is gold, and only while its light is on. */
export const GOLD_EVERY = 20;

/** A gold fly reads as gold only above this pulse level. */
export const GOLD_LEVEL_MIN = 0.5;

/** Smallest and largest fly radius in CSS pixels. */
const RADIUS_MIN = 1.2;
const RADIUS_RANGE = 1.8;

/** Travel speed in CSS pixels per frame: a slow amble. */
const SPEED_MIN = 0.15;
const SPEED_RANGE = 0.25;

/** Pulse speed in radians per frame: one flash every few seconds. */
const RATE_MIN = 0.012;
const RATE_RANGE = 0.02;

/** Wander: the largest heading change per frame, and how fast it reverses. */
const TURN_MAX = 0.08;
export const WANDER_RATE = 0.009;

/** Flies leave and re-enter past the edge by this many pixels. */
export const WRAP_MARGIN = 12;

/** Reach (gaussian sigma) and peak share of the way a fly is drawn to the pointer. */
const PULL_SIGMA = 150;
const PULL_STRENGTH = 0.55;

/** Tiers a fly is drawn in: three ink brightnesses, then gold. */
export const TIER_GOLD = 3;
export const TIER_COUNT = 4;

/** Fly pool, one slot per fly. Mutated in place by the engine's closure only. */
export interface Flies {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: Float32Array;
  readonly speed: Float32Array;
  readonly heading: Float32Array;
  /** Phase of the slow back-and-forth turning. */
  readonly wander: Float32Array;
  /** Phase of the pulse. */
  readonly phase: Float32Array;
  /** Pulse speed, radians per frame. */
  readonly rate: Float32Array;
  /** Eased displacement towards the pointer. */
  readonly pullX: Float32Array;
  readonly pullY: Float32Array;
}

/** Small seeded generator (mulberry32) so a spawn never touches `Math.random`. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flies for a canvas of the given CSS size, capped. */
export function flyCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  return Math.min(FLY_COUNT_MAX, Math.round((width * height) / AREA_PER_FLY));
}

/** Radius for a uniform `r` in `[0, 1]`. */
export function flyRadius(r: number): number {
  return RADIUS_MIN + RADIUS_RANGE * r;
}

export function isGoldFly(index: number): boolean {
  return index % GOLD_EVERY === 0;
}

/** Brightness in `[0, 1]` for a pulse phase: squared so each flash is brief. */
export function pulseLevel(phase: number): number {
  const wave = 0.5 + 0.5 * Math.sin(phase);
  return wave * wave;
}

/** Which draw tier a fly belongs to, given its pulse level. */
export function flyTier(index: number, level: number): number {
  if (isGoldFly(index) && level >= GOLD_LEVEL_MIN) return TIER_GOLD;
  if (level < 0.25) return 0;
  return level < 0.6 ? 1 : 2;
}

/** Heading change for a wander phase: a gentle left-right weave. */
export function turnRate(wanderPhase: number): number {
  return TURN_MAX * Math.sin(wanderPhase);
}

/** Wraps `value` across a `size` canvas, re-entering from the far edge. */
export function wrap(value: number, size: number, margin: number): number {
  if (value < -margin) return size + margin;
  if (value > size + margin) return -margin;
  return value;
}

/**
 * Share of the way to the pointer a fly at `distance` from it is drawn: most
 * for the close ones, none far away. Zero while the pointer has never entered
 * the canvas (its coordinates are infinite).
 */
export function pullFraction(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  return PULL_STRENGTH * Math.exp(-(distance * distance) / (2 * PULL_SIGMA * PULL_SIGMA));
}

/** Allocates the pool once; slots are filled by `spawnFly`. */
export function createFlies(count: number): Flies {
  return {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    radius: new Float32Array(count),
    speed: new Float32Array(count),
    heading: new Float32Array(count),
    wander: new Float32Array(count),
    phase: new Float32Array(count),
    rate: new Float32Array(count),
    pullX: new Float32Array(count),
    pullY: new Float32Array(count),
  };
}

/** Fills slot `i`: anywhere on the canvas, at its own pace and moment in the pulse. */
export function spawnFly(
  flies: Flies,
  i: number,
  width: number,
  height: number,
  random: () => number
): void {
  flies.radius[i] = flyRadius(random());
  flies.speed[i] = SPEED_MIN + SPEED_RANGE * random();
  flies.heading[i] = random() * Math.PI * 2;
  flies.wander[i] = random() * Math.PI * 2;
  flies.phase[i] = random() * Math.PI * 2;
  flies.rate[i] = RATE_MIN + RATE_RANGE * random();
  flies.x[i] = random() * width;
  flies.y[i] = random() * height;
  flies.pullX[i] = 0;
  flies.pullY[i] = 0;
}
