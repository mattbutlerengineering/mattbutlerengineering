import { describe, it, expect } from "vitest";
import {
  GOLD_RING_INDEX,
  buildRings,
  gcd,
  hypotrochoidPeriod,
  hypotrochoidPoint,
  ringCount,
  ringPhaseShift,
} from "./guilloche-curves";

describe("gcd", () => {
  it("returns the greatest common divisor", () => {
    expect(gcd(12, 8)).toBe(4);
    expect(gcd(7, 5)).toBe(1);
  });
});

describe("hypotrochoidPeriod", () => {
  it("is 2π·r/gcd(R, r) — the parameter span after which the curve closes", () => {
    expect(hypotrochoidPeriod(5, 3)).toBeCloseTo(2 * Math.PI * 3);
    expect(hypotrochoidPeriod(8, 4)).toBeCloseTo(2 * Math.PI);
  });
});

describe("hypotrochoidPoint", () => {
  const spec = { bigR: 5, smallR: 3, offset: 2 };

  it("starts at (R - r + d, 0)", () => {
    const point = hypotrochoidPoint(spec, 0);
    expect(point.x).toBeCloseTo(4);
    expect(point.y).toBeCloseTo(0);
  });

  it("closes: the end of the period lands on the start", () => {
    const start = hypotrochoidPoint(spec, 0);
    const end = hypotrochoidPoint(spec, hypotrochoidPeriod(5, 3));
    expect(end.x).toBeCloseTo(start.x);
    expect(end.y).toBeCloseTo(start.y);
  });

  it("stays within R - r + d of the centre", () => {
    for (let t = 0; t < hypotrochoidPeriod(5, 3); t += 0.3) {
      const { x, y } = hypotrochoidPoint(spec, t);
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(4 + 1e-9);
    }
  });
});

describe("ringCount", () => {
  it("grows with the short side but is clamped", () => {
    expect(ringCount(100, 100)).toBe(ringCount(1, 1));
    expect(ringCount(4000, 4000)).toBeGreaterThan(ringCount(100, 100));
    expect(ringCount(100000, 100000)).toBe(ringCount(200000, 200000));
  });

  it("always leaves room for the gold ring", () => {
    expect(ringCount(1, 1)).toBeGreaterThan(GOLD_RING_INDEX);
  });
});

describe("buildRings", () => {
  it("produces the requested count with strictly growing radii", () => {
    const rings = buildRings(5, 300);
    expect(rings).toHaveLength(5);
    rings.forEach((ring, i) => {
      if (i > 0) expect(ring.radius).toBeGreaterThan(rings[i - 1]?.radius ?? 0);
    });
  });

  it("keeps the outermost ring inside the max radius", () => {
    const rings = buildRings(6, 300);
    expect(rings[rings.length - 1]?.radius).toBeLessThanOrEqual(300);
  });

  it("marks exactly one ring gold — the 5% rule", () => {
    const rings = buildRings(6, 300);
    expect(rings.filter((ring) => ring.gold)).toHaveLength(1);
    expect(rings[GOLD_RING_INDEX]?.gold).toBe(true);
  });

  it("is deterministic", () => {
    expect(buildRings(5, 300)).toEqual(buildRings(5, 300));
  });
});

describe("ringPhaseShift", () => {
  it("is zero when the pointer is far from the ring", () => {
    expect(ringPhaseShift(100, 600)).toBe(0);
  });

  it("is zero when there is no pointer (non-finite distance)", () => {
    expect(ringPhaseShift(100, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("peaks when the pointer sits on the ring", () => {
    expect(ringPhaseShift(100, 100)).toBeGreaterThan(ringPhaseShift(100, 130));
    expect(ringPhaseShift(100, 130)).toBeGreaterThan(0);
  });

  it("falls off symmetrically either side of the ring", () => {
    expect(ringPhaseShift(100, 120)).toBeCloseTo(ringPhaseShift(100, 80));
  });
});
