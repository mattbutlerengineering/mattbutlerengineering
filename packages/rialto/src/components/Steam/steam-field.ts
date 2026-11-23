/**
 * Pure maths behind the Steam backdrop — no DOM, no canvas.
 *
 * A fixed pool of wisps lives in typed arrays, so the frame loop never
 * allocates per wisp: it only rewrites numbers in place.
 */

/** Cap on wisps so a huge canvas stays cheap: the per-frame work is bounded. */
export const WISP_COUNT_MAX = 24;

/** One wisp per this many square CSS pixels, until the cap: few and large. */
const AREA_PER_WISP = 30000;

/** Every Nth wisp is gold, and only while it is thick. */
export const GOLD_EVERY = 24;

/** A gold wisp reads as gold only above this envelope level. */
export const GOLD_LEVEL_MIN = 0.5;

/** Radius at spawn in CSS pixels; a wisp swells to `1 + GROWTH` times this. */
const RADIUS_MIN = 36;
const RADIUS_RANGE = 34;
export const GROWTH = 0.7;

/** Rise in CSS pixels per frame, and life gained per frame (~9-16 s a wisp). */
const RISE_MIN = 0.25;
const RISE_RANGE = 0.3;
const AGE_MIN = 0.0011;
const AGE_RANGE = 0.0009;

/** Sideways sway: its reach in pixels and speed in radians per frame. */
const SWAY_REACH_MIN = 12;
const SWAY_REACH_RANGE = 28;
const SWAY_RATE_MIN = 0.006;
const SWAY_RATE_RANGE = 0.008;

/** Tiers a wisp is drawn in: three ink densities, then gold. */
export const TIER_GOLD = 3;
export const TIER_COUNT = 4;

/** Wisp pool, one slot per wisp. Mutated in place by the engine's closure only. */
export interface Wisps {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Radius at spawn. */
  readonly radius: Float32Array;
  readonly rise: Float32Array;
  /** Position in the wisp's life, `[0, 1)`. */
  readonly life: Float32Array;
  /** Life gained per frame. */
  readonly age: Float32Array;
  /** Phase, reach and speed of the side-to-side sway. */
  readonly swayPhase: Float32Array;
  readonly swayReach: Float32Array;
  readonly swayRate: Float32Array;
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

/** Wisps for a canvas of the given CSS size, capped. */
export function wispCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  return Math.min(WISP_COUNT_MAX, Math.max(1, Math.round((width * height) / AREA_PER_WISP)));
}

/** Spawn radius for a uniform `r` in `[0, 1]`. */
export function wispRadius(r: number): number {
  return RADIUS_MIN + RADIUS_RANGE * r;
}

export function isGoldWisp(index: number): boolean {
  return index % GOLD_EVERY === 0;
}

/** Density in `[0, 1]` across a life: fades in, peaks mid-rise, fades out. */
export function envelope(life: number): number {
  const wave = Math.sin(Math.PI * life);
  return wave * wave;
}

/** Which draw tier a wisp belongs to, given its envelope level. */
export function wispTier(index: number, level: number): number {
  if (isGoldWisp(index) && level >= GOLD_LEVEL_MIN) return TIER_GOLD;
  if (level < 0.25) return 0;
  return level < 0.65 ? 1 : 2;
}

/** Side-to-side offset share in `[-1, 1]` for a sway phase. */
export function sway(phase: number): number {
  return Math.sin(phase);
}

/** Allocates the pool once; slots are filled by `spawnWisp`. */
export function createWisps(count: number): Wisps {
  return {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    radius: new Float32Array(count),
    rise: new Float32Array(count),
    life: new Float32Array(count),
    age: new Float32Array(count),
    swayPhase: new Float32Array(count),
    swayReach: new Float32Array(count),
    swayRate: new Float32Array(count),
  };
}

/**
 * Fills slot `i`. The first spawn (`initial`) scatters wisps through their
 * lives and across the canvas; a respawn starts a new life low on the canvas.
 */
export function spawnWisp(
  wisps: Wisps,
  i: number,
  width: number,
  height: number,
  random: () => number,
  initial: boolean
): void {
  const radius = wispRadius(random());
  wisps.radius[i] = radius;
  wisps.rise[i] = RISE_MIN + RISE_RANGE * random();
  wisps.age[i] = AGE_MIN + AGE_RANGE * random();
  wisps.swayPhase[i] = random() * Math.PI * 2;
  wisps.swayReach[i] = SWAY_REACH_MIN + SWAY_REACH_RANGE * random();
  wisps.swayRate[i] = SWAY_RATE_MIN + SWAY_RATE_RANGE * random();
  wisps.x[i] = random() * width;
  if (initial) {
    wisps.life[i] = random();
    wisps.y[i] = random() * height;
  } else {
    wisps.life[i] = 0;
    wisps.y[i] = height + random() * radius;
  }
}
