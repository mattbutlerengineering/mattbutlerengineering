/**
 * Pure maths behind the Guilloche rosette — no DOM, no canvas.
 *
 * Kept separate from the engine so the curves can be reasoned about and tested
 * in isolation from the render loop.
 *
 * Each ring is a hypotrochoid with an integer lobe count `k`, written in unit
 * form: `(cos t + h·cos(k·t + φ), sin t − h·sin(k·t + φ)) / (1 + h)`. An integer
 * `k` closes the curve after exactly one turn; `h` is how deep the lobes cut;
 * `φ` is the phase that makes the engraving drift.
 */

export interface RingSpec {
  /** Integer lobe count — also what makes the curve close after one turn. */
  readonly lobes: number;
  /** Lobe depth relative to the base circle, `(0, 1)`. */
  readonly depth: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Seven rings, innermost first. Distinct lobe counts so the layers interweave. */
export const RINGS: readonly RingSpec[] = [
  { lobes: 7, depth: 0.2 },
  { lobes: 9, depth: 0.19 },
  { lobes: 11, depth: 0.18 },
  { lobes: 13, depth: 0.17 },
  { lobes: 15, depth: 0.16 },
  { lobes: 17, depth: 0.15 },
  { lobes: 19, depth: 0.14 },
];

/** The one ring stroked in the gold accent. */
export const GOLD_RING_INDEX = 4;

/** The innermost ring's radius, as a fraction of the outermost. */
const INNER_RADIUS_FRACTION = 0.3;
/** Rosette radius as a fraction of the container's shorter side. */
const RADIUS_PER_SHORT_SIDE = 0.55;
/** Segments per lobe — enough that every lobe reads as a curve, not a polygon. */
const STEPS_PER_LOBE = 24;
const MIN_STEPS = 240;

/** How far from a ring, in CSS pixels, the pointer still shifts its phase. */
const POINTER_BAND = 70;
/** Peak phase shift, in radians, applied to a ring directly under the pointer. */
const POINTER_PHASE_PUSH = 1.1;

/** Phase drift per frame for the innermost ring; outer rings scale from it. */
export const PHASE_STEP = 0.004;
/** Rigid rotation per frame for the innermost ring. */
export const ROTATION_STEP = 0.0012;

/**
 * A point on a ring at curve angle `theta`, inside the unit disc. `phase`
 * morphs the lobes; `rotation` turns the whole ring rigidly.
 */
export function rosettePoint(
  ring: RingSpec,
  theta: number,
  phase: number,
  rotation: number
): Point {
  const inner = ring.lobes * theta + phase;
  const x = Math.cos(theta) + ring.depth * Math.cos(inner);
  const y = Math.sin(theta) - ring.depth * Math.sin(inner);
  const scale = 1 / (1 + ring.depth);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: (x * cos - y * sin) * scale, y: (x * sin + y * cos) * scale };
}

/** Segments to draw one full turn of a ring with `lobes` lobes. */
export function curveSteps(lobes: number): number {
  return Math.max(MIN_STEPS, lobes * STEPS_PER_LOBE);
}

/** Radius of ring `index`, spread evenly from the inner fraction out to `outer`. */
export function ringRadius(index: number, outer: number): number {
  const span = RINGS.length - 1;
  const t = span === 0 ? 1 : index / span;
  return outer * (INNER_RADIUS_FRACTION + (1 - INNER_RADIUS_FRACTION) * t);
}

/** Outer radius of the rosette for a canvas of the given CSS size. */
export function rosetteRadius(width: number, height: number): number {
  return Math.min(width, height) * RADIUS_PER_SHORT_SIDE;
}

/**
 * The phase shift a ring wants given how far the pointer is from the rosette
 * centre. Peaks when the pointer sits on the ring and tapers linearly to zero
 * at the edge of the band; a pointer that never entered yields zero.
 */
export function pointerPhaseTarget(pointerDistance: number, radius: number): number {
  const offset = Math.abs(pointerDistance - radius);
  if (!(offset < POINTER_BAND)) return 0;
  return (1 - offset / POINTER_BAND) * POINTER_PHASE_PUSH;
}
