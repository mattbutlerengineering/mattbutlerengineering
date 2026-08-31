import { MOVEMENT, PLATE_RADIUS, findBodyOverlaps, outerReach, tipRadius } from "./movement";
import type { MovementPart } from "./movement";

/**
 * Geometry guard for the caseback layout. The first cut of WatchLoader drew the
 * balance wheel over three gears and intersected the centre/third wheels'
 * bodies — nothing in the renderer can catch that, so the layout is a pure
 * value and its clearances are asserted here.
 */
describe("WatchLoader movement geometry", () => {
  it("no two parts' bodies overlap (tips may mesh)", () => {
    expect(findBodyOverlaps(MOVEMENT)).toEqual([]);
  });

  it("every part sits inside the plate with a margin", () => {
    for (const part of Object.values(MOVEMENT)) {
      expect(outerReach(part), part.id).toBeLessThanOrEqual(PLATE_RADIUS - 4);
    }
  });

  it("meshing wheels' tooth zones overlap — the tip circles intersect", () => {
    const { centerWheel, thirdWheel, fourthWheel } = MOVEMENT;
    const pairs: ReadonlyArray<readonly [MovementPart, MovementPart]> = [
      [centerWheel, thirdWheel],
      [thirdWheel, fourthWheel],
    ];
    for (const [a, b] of pairs) {
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      expect(d, `${a.id}↔${b.id}`).toBeLessThan(tipRadius(a) + tipRadius(b));
    }
  });
});
