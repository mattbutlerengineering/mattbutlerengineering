/**
 * Pure maths behind the Guilloche rosettes — no DOM, no canvas.
 *
 * Kept separate from the engine so the curves can be reasoned about and tested
 * in isolation from the render loop.
 */

/** Index of the single gold ring — the 5% accent rule. */
export const GOLD_RING_INDEX = 2;

const MIN_RINGS = 4;
const MAX_RINGS = 8;
/** Short-side pixels per ring. */
const PX_PER_RING = 90;
/** The innermost ring sits at this fraction of the outermost. */
const INNER_FRACTION = 0.22;
/** How far (px) the pointer reaches from a ring's radius. */
const POINTER_REACH = 90;
/** Peak phase shift, in radians, applied when the pointer sits on a ring. */
const MAX_PHASE_SHIFT = 0.9;

/** Fixed (R, r, d) hypotrochoid recipes, cycled across rings for variety. */
const RECIPES = [
  { bigR: 7, smallR: 3, offsetRatio: 0.9 },
  { bigR: 9, smallR: 4, offsetRatio: 0.8 },
  { bigR: 11, smallR: 4, offsetRatio: 0.85 },
  { bigR: 8, smallR: 3, offsetRatio: 0.95 },
] as const;

export interface HypotrochoidSpec {
  readonly bigR: number;
  readonly smallR: number;
  readonly offset: number;
}

export interface Ring extends HypotrochoidSpec {
  /** Outer extent of the ring, in CSS pixels from the rosette centre. */
  readonly radius: number;
  /** Rotation direction and relative speed. */
  readonly spin: number;
  /** Starting phase, in radians. */
  readonly phase: number;
  readonly gold: boolean;
}

export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Parameter span after which the curve closes on itself. */
export function hypotrochoidPeriod(bigR: number, smallR: number): number {
  return (2 * Math.PI * smallR) / gcd(bigR, smallR);
}

/** A point on the unit-scale hypotrochoid at parameter `t`. */
export function hypotrochoidPoint(
  { bigR, smallR, offset }: HypotrochoidSpec,
  t: number
): { x: number; y: number } {
  const k = (bigR - smallR) / smallR;
  return {
    x: (bigR - smallR) * Math.cos(t) + offset * Math.cos(k * t),
    y: (bigR - smallR) * Math.sin(t) - offset * Math.sin(k * t),
  };
}

/** How many rings fit a canvas of the given CSS size. */
export function ringCount(width: number, height: number): number {
  const byArea = Math.floor(Math.min(width, height) / PX_PER_RING);
  return Math.min(MAX_RINGS, Math.max(MIN_RINGS, byArea));
}

/** Builds `count` concentric rings spanning the inner fraction up to `maxRadius`. */
export function buildRings(count: number, maxRadius: number): readonly Ring[] {
  return Array.from({ length: count }, (_, index) => {
    const recipe = RECIPES[index % RECIPES.length] ?? RECIPES[0];
    const t = count > 1 ? index / (count - 1) : 1;
    const radius = maxRadius * (INNER_FRACTION + (1 - INNER_FRACTION) * t);
    return {
      bigR: recipe.bigR,
      smallR: recipe.smallR,
      offset: recipe.smallR * recipe.offsetRatio,
      radius,
      spin: (index % 2 === 0 ? 1 : -1) * (0.6 + 0.15 * index),
      phase: index * 0.7,
      gold: index === GOLD_RING_INDEX,
    };
  });
}

/**
 * Phase shift for a ring when the pointer is `pointerDistance` from the rosette
 * centre. Peaks when the pointer sits on the ring, fading to zero at
 * `POINTER_REACH` either side; zero for a non-finite distance (no pointer yet).
 */
export function ringPhaseShift(ringRadius: number, pointerDistance: number): number {
  if (!Number.isFinite(pointerDistance)) return 0;
  const gap = Math.abs(pointerDistance - ringRadius);
  if (gap >= POINTER_REACH) return 0;
  return (1 - gap / POINTER_REACH) * MAX_PHASE_SHIFT;
}
