/**
 * Pure maths behind the Champagne bubbles — no DOM, no canvas.
 *
 * A fixed pool of bubbles lives in typed arrays, so the frame loop never
 * allocates per bubble: it only rewrites numbers in place. Everything here is
 * scalar maths or a write into those private buffers.
 */

/** Cap on bubbles so a huge canvas stays cheap: the per-frame work is bounded. */
export const BUBBLE_COUNT_MAX = 140;

/** One bubble per this many square CSS pixels, until the cap. */
const AREA_PER_BUBBLE = 5200;

/** Every Nth bubble is stroked in the gold accent; the rest are ink. */
export const GOLD_EVERY = 20;

/** Smallest and largest bubble radius in CSS pixels. */
const RADIUS_MIN = 1.5;
const RADIUS_RANGE = 5;

/** Rise speed in CSS pixels per frame: a floor plus a share of the radius. */
const SPEED_BASE = 0.35;
const SPEED_PER_RADIUS = 0.2;

/** Side-to-side wobble: amplitude in px, and radians per px of height. */
const SWAY_AMPLITUDE = 12;
const SWAY_FREQUENCY = 0.018;

/** Reach (gaussian sigma) and peak sideways shove of the pointer, in CSS pixels. */
const PUSH_SIGMA = 90;
const PUSH_STRENGTH = 46;

/** Bubble pool, one slot per bubble. Mutated in place by the engine's closure only. */
export interface Bubbles {
  readonly count: number;
  /** Resting column; the sway and pointer push are added when drawing. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: Float32Array;
  readonly speed: Float32Array;
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

/** Bubbles for a canvas of the given CSS size, capped. */
export function bubbleCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  return Math.min(BUBBLE_COUNT_MAX, Math.round((width * height) / AREA_PER_BUBBLE));
}

/** Radius for a uniform `r` in `[0, 1]`; squared so small bubbles dominate. */
export function bubbleRadius(r: number): number {
  return RADIUS_MIN + RADIUS_RANGE * r * r;
}

/** Bigger bubbles rise faster. */
export function bubbleSpeed(radius: number): number {
  return SPEED_BASE + SPEED_PER_RADIUS * radius;
}

export function isGoldBubble(index: number): boolean {
  return index % GOLD_EVERY === 0;
}

/** Horizontal wobble at height `y`, offset per bubble by `phase`. */
export function swayOffset(phase: number, y: number): number {
  return SWAY_AMPLITUDE * Math.sin(phase + y * SWAY_FREQUENCY);
}

/**
 * Sideways shove for a bubble at offset `(dx, dy)` from the cursor: away from
 * it, strongest close in. Zero while the pointer has never entered the canvas
 * (its coordinates are infinite).
 */
export function pointerPush(dx: number, dy: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  const falloff = Math.exp(-(dx * dx + dy * dy) / (2 * PUSH_SIGMA * PUSH_SIGMA));
  return Math.sign(dx) * PUSH_STRENGTH * falloff;
}

/** Allocates the pool once; slots are filled by `spawnBubble`. */
export function createBubbles(count: number): Bubbles {
  return {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    radius: new Float32Array(count),
    speed: new Float32Array(count),
    phase: new Float32Array(count),
    push: new Float32Array(count),
  };
}

/**
 * (Re)fills slot `i`. A respawn starts just below the bottom edge; the first
 * fill (`anywhere`) scatters bubbles over the whole height so the canvas is
 * never empty on its first frame.
 */
export function spawnBubble(
  bubbles: Bubbles,
  i: number,
  width: number,
  height: number,
  random: () => number,
  anywhere: boolean
): void {
  const radius = bubbleRadius(random());
  bubbles.radius[i] = radius;
  bubbles.speed[i] = bubbleSpeed(radius);
  bubbles.phase[i] = random() * Math.PI * 2;
  bubbles.x[i] = random() * width;
  bubbles.y[i] = anywhere ? random() * height : height + radius + random() * height * 0.25;
  bubbles.push[i] = 0;
}
