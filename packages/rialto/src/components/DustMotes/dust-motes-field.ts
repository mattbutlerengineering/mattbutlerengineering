/**
 * Pure maths behind the DustMotes backdrop — no DOM, no canvas.
 *
 * A fixed pool of motes lives in typed arrays, so the frame loop never
 * allocates per mote: it only rewrites numbers in place. Everything here is
 * scalar maths or a write into those private buffers.
 */

/** Cap on motes so a huge canvas stays cheap: the per-frame work is bounded. */
export const MOTE_COUNT_MAX = 100;

/** One mote per this many square CSS pixels, until the cap. */
const AREA_PER_MOTE = 7000;

/** Every Nth mote is gold, and only while the light shaft catches it. */
export const GOLD_EVERY = 20;

/** A gold mote reads as gold only above this light level. */
export const GOLD_LIGHT_MIN = 0.2;

/** Smallest and largest mote radius in CSS pixels. */
const RADIUS_MIN = 0.7;
const RADIUS_RANGE = 1.9;

/** Fall speed in CSS pixels per frame: dust settles slowly. */
const FALL_MIN = 0.05;
const FALL_RANGE = 0.15;

/** Sideways drift in CSS pixels per frame, either direction. */
const DRIFT_RANGE = 0.12;

/** Wander: amplitude in px, and radians per px of height. */
const SWAY_AMPLITUDE = 7;
const SWAY_FREQUENCY = 0.011;

/** The shaft leans: its centre line runs from this fraction of the width at the top... */
const SHAFT_TOP = 0.72;
/** ...to this fraction at the bottom. */
const SHAFT_BOTTOM = 0.28;
/** Shaft half-width (gaussian sigma) as a share of the canvas's mean side. */
const SHAFT_SIGMA = 0.13;

/** Reach (gaussian sigma) and peak sideways shove of the pointer, in CSS pixels. */
const PUSH_SIGMA = 80;
const PUSH_STRENGTH = 34;

/** Tiers a mote is drawn in: three ink brightnesses, then gold. */
export const TIER_GOLD = 3;
export const TIER_COUNT = 4;

/** Mote pool, one slot per mote. Mutated in place by the engine's closure only. */
export interface Motes {
  readonly count: number;
  /** Resting column; the wander and pointer push are added when drawing. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: Float32Array;
  readonly fall: Float32Array;
  readonly drift: Float32Array;
  readonly phase: Float32Array;
  /** Eased sideways displacement from the pointer. */
  readonly push: Float32Array;
}

/** Small seeded generator (mulberry32) so a respawn never touches `Math.random`. */
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

/** Motes for a canvas of the given CSS size, capped. */
export function moteCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  return Math.min(MOTE_COUNT_MAX, Math.round((width * height) / AREA_PER_MOTE));
}

/** Radius for a uniform `r` in `[0, 1]`; squared so small motes dominate. */
export function moteRadius(r: number): number {
  return RADIUS_MIN + RADIUS_RANGE * r * r;
}

export function isGoldMote(index: number): boolean {
  return index % GOLD_EVERY === 0;
}

/** Horizontal wander at height `y`, offset per mote by `phase`. */
export function swayOffset(phase: number, y: number): number {
  return SWAY_AMPLITUDE * Math.sin(phase + y * SWAY_FREQUENCY);
}

/** Centre line of the shaft at height `y`: its column in CSS pixels. */
export function shaftCentre(y: number, width: number, height: number): number {
  if (height <= 0) return width * SHAFT_TOP;
  const t = y / height;
  return width * (SHAFT_TOP + (SHAFT_BOTTOM - SHAFT_TOP) * t);
}

/**
 * How much light falls on `(x, y)`, in `[0, 1]`: a soft gaussian across a
 * leaning shaft. Measured sideways from the centre line, which is close enough
 * to the true perpendicular for a decorative falloff.
 */
export function shaftLight(x: number, y: number, width: number, height: number): number {
  const sigma = SHAFT_SIGMA * ((width + height) / 2);
  if (sigma <= 0) return 0;
  const d = x - shaftCentre(y, width, height);
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

/** Endpoints of the gradient across the shaft, for painting its glow. */
export function shaftGradientLine(
  width: number,
  height: number
): { x0: number; y0: number; x1: number; y1: number } {
  const midY = height / 2;
  const half = SHAFT_SIGMA * ((width + height) / 2) * 3;
  const centre = shaftCentre(midY, width, height);
  return { x0: centre - half, y0: midY, x1: centre + half, y1: midY };
}

/** Which draw tier a mote belongs to, given the light on it. */
export function moteTier(index: number, light: number): number {
  if (isGoldMote(index) && light >= GOLD_LIGHT_MIN) return TIER_GOLD;
  if (light < 0.25) return 0;
  return light < 0.6 ? 1 : 2;
}

/**
 * Sideways shove for a mote at offset `(dx, dy)` from the cursor: away from
 * it, strongest close in. Zero while the pointer has never entered the canvas
 * (its coordinates are infinite).
 */
export function pointerPush(dx: number, dy: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  const falloff = Math.exp(-(dx * dx + dy * dy) / (2 * PUSH_SIGMA * PUSH_SIGMA));
  return Math.sign(dx) * PUSH_STRENGTH * falloff;
}

/** Allocates the pool once; slots are filled by `spawnMote`. */
export function createMotes(count: number): Motes {
  return {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    radius: new Float32Array(count),
    fall: new Float32Array(count),
    drift: new Float32Array(count),
    phase: new Float32Array(count),
    push: new Float32Array(count),
  };
}

/**
 * (Re)fills slot `i`. A respawn starts just above the top edge; the first fill
 * (`anywhere`) scatters motes over the whole height so the canvas is never
 * empty on its first frame.
 */
export function spawnMote(
  motes: Motes,
  i: number,
  width: number,
  height: number,
  random: () => number,
  anywhere: boolean
): void {
  const radius = moteRadius(random());
  motes.radius[i] = radius;
  motes.fall[i] = FALL_MIN + FALL_RANGE * random();
  motes.drift[i] = (random() - 0.5) * 2 * DRIFT_RANGE;
  motes.phase[i] = random() * Math.PI * 2;
  motes.x[i] = random() * width;
  motes.y[i] = anywhere ? random() * height : -radius - random() * height * 0.1;
  motes.push[i] = 0;
}
