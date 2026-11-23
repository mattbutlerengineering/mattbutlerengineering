import { describe, it, expect } from "vitest";
import {
  createPoints,
  createRandom,
  isGoldPoint,
  GOLD_EVERY,
  LINK_DISTANCE,
  LINK_TIER_COUNT,
  linkTier,
  nearestToPointer,
  pointCount,
  POINT_COUNT_MAX,
  POINTER_LINKS_MAX,
  POINTER_REACH,
  spawnPoint,
  wrap,
} from "./constellation-field";

describe("createRandom", () => {
  it("is deterministic for a seed and stays in [0, 1)", () => {
    const a = createRandom(7);
    const b = createRandom(7);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("pointCount", () => {
  it("is zero for an empty canvas", () => {
    expect(pointCount(0, 400)).toBe(0);
    expect(pointCount(400, 0)).toBe(0);
  });

  it("grows with area", () => {
    expect(pointCount(800, 600)).toBeGreaterThan(pointCount(200, 150));
  });

  it("is capped so a huge canvas stays cheap", () => {
    expect(pointCount(8000, 6000)).toBe(POINT_COUNT_MAX);
  });
});

describe("isGoldPoint", () => {
  it("marks every GOLD_EVERY-th point gold, at most 5% of a full pool", () => {
    expect(isGoldPoint(0)).toBe(true);
    expect(isGoldPoint(1)).toBe(false);
    expect(isGoldPoint(GOLD_EVERY)).toBe(true);
    let gold = 0;
    for (let i = 0; i < POINT_COUNT_MAX; i++) if (isGoldPoint(i)) gold++;
    expect(gold).toBeGreaterThan(0);
    expect(gold / POINT_COUNT_MAX).toBeLessThanOrEqual(0.05);
  });
});

describe("linkTier", () => {
  it("does not link points at or beyond the link distance", () => {
    expect(linkTier(LINK_DISTANCE)).toBe(-1);
    expect(linkTier(LINK_DISTANCE * 2)).toBe(-1);
  });

  it("links near points more strongly than far ones", () => {
    expect(linkTier(1)).toBe(LINK_TIER_COUNT - 1);
    expect(linkTier(LINK_DISTANCE - 1)).toBe(0);
    expect(linkTier(LINK_DISTANCE * 0.5)).toBeGreaterThan(linkTier(LINK_DISTANCE * 0.95));
  });
});

describe("nearestToPointer", () => {
  const xs = new Float32Array([100, 10, 50, 400]);
  const ys = new Float32Array([100, 10, 50, 400]);

  it("finds nothing while the pointer has never entered the canvas", () => {
    const out = new Int16Array(POINTER_LINKS_MAX);
    expect(nearestToPointer(xs, ys, 4, Infinity, Infinity, out)).toBe(0);
  });

  it("returns the nearest points within reach, nearest first, up to the cap", () => {
    const out = new Int16Array(POINTER_LINKS_MAX);
    const n = nearestToPointer(xs, ys, 4, 60, 60, out);
    expect(n).toBeLessThanOrEqual(POINTER_LINKS_MAX);
    expect(n).toBe(3);
    expect(out[0]).toBe(2);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(1);
  });

  it("ignores points beyond the pointer reach", () => {
    const out = new Int16Array(POINTER_LINKS_MAX);
    const n = nearestToPointer(xs, ys, 4, 400 + POINTER_REACH, 400 + POINTER_REACH, out);
    expect(n).toBe(0);
  });
});

describe("wrap", () => {
  it("re-enters from the opposite edge past a margin", () => {
    expect(wrap(-20, 400, 10)).toBe(410);
    expect(wrap(420, 400, 10)).toBe(-10);
    expect(wrap(200, 400, 10)).toBe(200);
  });
});

describe("createPoints / spawnPoint", () => {
  it("allocates fixed typed buffers sized to the count", () => {
    const points = createPoints(12);
    expect(points.count).toBe(12);
    expect(points.x).toHaveLength(12);
    expect(points.vy).toHaveLength(12);
  });

  it("scatters points inside the canvas with a slow velocity", () => {
    const points = createPoints(40);
    const random = createRandom(3);
    for (let i = 0; i < 40; i++) spawnPoint(points, i, 400, 300, random);
    for (let i = 0; i < 40; i++) {
      expect(points.x[i]).toBeGreaterThanOrEqual(0);
      expect(points.x[i]).toBeLessThanOrEqual(400);
      expect(points.y[i]).toBeGreaterThanOrEqual(0);
      expect(points.y[i]).toBeLessThanOrEqual(300);
      expect(Math.hypot(points.vx[i] ?? 0, points.vy[i] ?? 0)).toBeGreaterThan(0);
      expect(Math.hypot(points.vx[i] ?? 0, points.vy[i] ?? 0)).toBeLessThan(0.5);
    }
  });
});
