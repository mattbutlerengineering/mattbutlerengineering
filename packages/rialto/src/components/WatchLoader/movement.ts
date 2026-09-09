/**
 * Caseback layout for WatchLoader, as pure data (viewBox 100×100, pivot at
 * 50,50). Positions and radii live here rather than inline in the JSX so the
 * layout's clearances can be asserted by `movement.test.ts` — the renderer
 * cannot tell an overlapping wheel from a meshing one.
 */
export interface MovementPart {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  /** Body radius (the solid disc, excluding teeth). */
  readonly radius: number;
  /** Tooth count for the gear train; absent on the balance and escape wheels. */
  readonly teeth?: number;
}

export const PLATE_RADIUS = 48;
export const PIVOT = { x: 50, y: 50 } as const;
/** Tooth length as a fraction of body radius. */
export const TOOTH_RATIO = 0.28;
export const ESCAPE_TEETH = 15;
export const ROTOR_RADIUS = 44;

export const MOVEMENT = {
  balance: { id: "balance", cx: 33, cy: 37, radius: 14 },
  centerWheel: { id: "centerWheel", cx: 64, cy: 40, radius: 12, teeth: 12 },
  thirdWheel: { id: "thirdWheel", cx: 50, cy: 59, radius: 8, teeth: 8 },
  fourthWheel: { id: "fourthWheel", cx: 67, cy: 64, radius: 6, teeth: 6 },
  escapeWheel: { id: "escapeWheel", cx: 34, cy: 68, radius: 8 },
} as const satisfies Record<string, MovementPart>;

export function toothLength(radius: number): number {
  return radius * TOOTH_RATIO;
}

/** Radius to the tooth tips (equals the body radius for toothless parts). */
export function tipRadius(part: MovementPart): number {
  return part.teeth === undefined ? part.radius : part.radius + toothLength(part.radius);
}

/** Distance from the pivot to the part's outermost point. */
export function outerReach(part: MovementPart): number {
  return Math.hypot(part.cx - PIVOT.x, part.cy - PIVOT.y) + tipRadius(part);
}

/** Pairs whose solid bodies intersect. Meshing teeth are allowed to cross. */
export function findBodyOverlaps(parts: Record<string, MovementPart>): string[] {
  const list = Object.values(parts);
  return list.flatMap((a, i) =>
    list
      .slice(i + 1)
      .filter((b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.radius + b.radius)
      .map((b) => `${a.id}↔${b.id}`)
  );
}
