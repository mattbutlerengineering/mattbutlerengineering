/**
 * Pure maths behind the SilkFlow flow field — no DOM, no canvas.
 *
 * Kept separate from the engine so the field can be reasoned about and tested
 * in isolation from the render loop.
 */

/** Particle budget per pixel of viewport area. */
const AREA_PER_PARTICLE = 4500;
const MAX_PARTICLES = 420;
const MIN_PARTICLES = 150;

/** How tightly the noise field is sampled in screen space. */
export const FIELD_SCALE = 0.0022;
/** Field evolution per frame. */
export const FIELD_TIME_STEP = 0.0035;
/** Full turns the noise range maps onto — two rotations, so strands curl. */
const FIELD_TURNS = Math.PI * 4;
/** The y axis drifts against the x axis, which shears the field over time. */
const TIME_SHEAR = 0.7;

/** Samples the value-noise field at a point. Returns a value in `[0, 1]`. */
export type ValueNoise = (x: number, y: number) => number;

/**
 * How many strands to simulate for a canvas of the given CSS size. Scales with
 * area so a phone doesn't pay desktop cost, with a floor so a small container
 * still reads as silk rather than as a handful of stray lines.
 */
export function silkParticleCount(width: number, height: number): number {
  const byArea = Math.floor((width * height) / AREA_PER_PARTICLE);
  return Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, byArea));
}

/** Flow-field direction, in radians, for a strand at `(x, y)` at time `t`. */
export function silkStrandAngle(noise: ValueNoise, x: number, y: number, t: number): number {
  return noise(x * FIELD_SCALE + t, y * FIELD_SCALE - TIME_SHEAR * t) * FIELD_TURNS;
}

/**
 * Bilinear value noise from an integer lattice hash — the smallest smooth,
 * deterministic 2D field that reads as organic, with no dependency.
 */
export function createValueNoise(): ValueNoise {
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep(x - x0);
    const fy = smoothstep(y - y0);

    const top = lerp(latticeHash(x0, y0), latticeHash(x0 + 1, y0), fx);
    const bottom = lerp(latticeHash(x0, y0 + 1), latticeHash(x0 + 1, y0 + 1), fx);
    return lerp(top, bottom, fy);
  };
}

/** Deterministic hash of an integer lattice point to `[0, 1)`. */
function latticeHash(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
