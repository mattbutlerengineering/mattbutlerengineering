import { describe, it, expect } from "vitest";
import {
  curveSteps,
  GOLD_RING_INDEX,
  pointerPhaseTarget,
  ringRadius,
  RINGS,
  rosettePoint,
  rosetteRadius,
} from "./guilloche-curve";

const RING = { lobes: 9, depth: 0.2 } as const;

describe("rosettePoint", () => {
  it("stays inside the unit disc across a full turn", () => {
    for (let i = 0; i <= 720; i++) {
      const { x, y } = rosettePoint(RING, (i / 720) * Math.PI * 2, 1.3, 0.4);
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("closes — a full turn returns to the start", () => {
    const start = rosettePoint(RING, 0, 0.7, 0.2);
    const end = rosettePoint(RING, Math.PI * 2, 0.7, 0.2);
    expect(end.x).toBeCloseTo(start.x, 9);
    expect(end.y).toBeCloseTo(start.y, 9);
  });

  it("morphs with phase — the same angle lands somewhere else", () => {
    const a = rosettePoint(RING, 1, 0, 0);
    const b = rosettePoint(RING, 1, 1.5, 0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.01);
  });

  it("rotation moves the curve rigidly — radius from the center is unchanged", () => {
    const a = rosettePoint(RING, 2, 0.9, 0);
    const b = rosettePoint(RING, 2, 0.9, 1.1);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(Math.hypot(b.x, b.y), 9);
    expect(a.x).not.toBeCloseTo(b.x, 3);
  });
});

describe("curveSteps", () => {
  it("resolves every lobe with plenty of segments", () => {
    expect(curveSteps(20)).toBeGreaterThanOrEqual(20 * 16);
  });

  it("keeps a floor for low lobe counts", () => {
    expect(curveSteps(3)).toBe(240);
  });
});

describe("RINGS", () => {
  it("has a single gold ring, inside the stack", () => {
    expect(GOLD_RING_INDEX).toBeGreaterThanOrEqual(0);
    expect(GOLD_RING_INDEX).toBeLessThan(RINGS.length);
  });

  it("uses a different lobe count per ring so the layers interweave", () => {
    expect(new Set(RINGS.map((ring) => ring.lobes)).size).toBe(RINGS.length);
  });

  it("grows outward from the center", () => {
    const radii = RINGS.map((_, index) => ringRadius(index, 100));
    expect([...radii].sort((a, b) => a - b)).toEqual(radii);
    expect(radii[radii.length - 1]).toBeCloseTo(100);
  });
});

describe("pointerPhaseTarget", () => {
  it("peaks when the pointer sits on the ring", () => {
    expect(pointerPhaseTarget(80, 80)).toBeGreaterThan(pointerPhaseTarget(100, 80));
  });

  it("is zero beyond the influence band", () => {
    expect(pointerPhaseTarget(400, 80)).toBe(0);
  });

  it("is zero while the pointer has never entered the canvas", () => {
    expect(pointerPhaseTarget(Number.POSITIVE_INFINITY, 80)).toBe(0);
  });
});

describe("rosetteRadius", () => {
  it("follows the shorter side", () => {
    expect(rosetteRadius(1200, 400)).toBe(rosetteRadius(400, 1200));
    expect(rosetteRadius(1200, 400)).toBeGreaterThan(rosetteRadius(1200, 200));
  });

  it("is zero for a collapsed container", () => {
    expect(rosetteRadius(0, 0)).toBe(0);
  });
});
