import { describe, it, expect } from "vitest";
import {
  draftPush,
  fadeAlpha,
  flicker,
  GOLD_EVERY,
  isGoldSpark,
  riseProgress,
  sparkSeed,
  SPARK_COUNT,
  swayOffset,
} from "./ember-spark";

describe("sparkSeed", () => {
  it("is deterministic", () => {
    expect(sparkSeed(17)).toEqual(sparkSeed(17));
  });

  it("keeps every field inside its documented range", () => {
    for (let i = 0; i < SPARK_COUNT; i++) {
      const seed = sparkSeed(i);
      expect(seed.x).toBeGreaterThanOrEqual(0);
      expect(seed.x).toBeLessThan(1);
      expect(seed.offset).toBeGreaterThanOrEqual(0);
      expect(seed.offset).toBeLessThan(1);
      expect(seed.speed).toBeGreaterThan(0);
      expect(seed.radius).toBeGreaterThan(0);
    }
  });

  it("varies between sparks", () => {
    expect(sparkSeed(1).x).not.toBe(sparkSeed(2).x);
  });
});

describe("isGoldSpark", () => {
  it("marks exactly the hottest 5% of sparks", () => {
    const gold = Array.from({ length: SPARK_COUNT }, (_, i) => i).filter(isGoldSpark);
    expect(gold).toHaveLength(SPARK_COUNT / GOLD_EVERY);
    expect(gold.length / SPARK_COUNT).toBeCloseTo(0.05, 10);
  });
});

describe("riseProgress", () => {
  it("stays in [0, 1) as time runs on", () => {
    const seed = sparkSeed(3);
    for (let t = 0; t < 500; t += 7.3) {
      const p = riseProgress(seed, t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });

  it("climbs with time until it wraps", () => {
    const seed = { ...sparkSeed(3), offset: 0 };
    expect(riseProgress(seed, 0.2)).toBeGreaterThan(riseProgress(seed, 0.1));
  });
});

describe("fadeAlpha", () => {
  it("is fully lit at the hearth and gone at the top", () => {
    expect(fadeAlpha(0)).toBe(1);
    expect(fadeAlpha(1)).toBe(0);
  });

  it("fades monotonically with height", () => {
    expect(fadeAlpha(0.6)).toBeLessThan(fadeAlpha(0.3));
  });
});

describe("flicker", () => {
  it("stays within a bounded band and never goes dark", () => {
    const seed = sparkSeed(5);
    for (let t = 0; t < 20; t += 0.05) {
      const f = flicker(seed, t);
      expect(f).toBeGreaterThanOrEqual(0.5);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it("actually varies over time", () => {
    const seed = sparkSeed(5);
    expect(flicker(seed, 0.1)).not.toBe(flicker(seed, 0.4));
  });
});

describe("swayOffset", () => {
  it("is bounded and varies with progress", () => {
    const seed = sparkSeed(8);
    expect(Math.abs(swayOffset(seed, 0.4))).toBeLessThanOrEqual(1);
    expect(swayOffset(seed, 0.1)).not.toBe(swayOffset(seed, 0.5));
  });
});

describe("draftPush", () => {
  it("is zero for a pointer that never entered", () => {
    expect(draftPush(10, 10, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("is zero outside the draft radius", () => {
    expect(draftPush(0, 0, 500, 0)).toEqual({ x: 0, y: 0 });
  });

  it("blows a nearby spark away from the pointer", () => {
    const push = draftPush(110, 100, 100, 100);
    expect(push.x).toBeGreaterThan(0);
    expect(push.y).toBeCloseTo(0, 9);
  });

  it("pushes harder the closer the spark is", () => {
    expect(draftPush(105, 100, 100, 100).x).toBeGreaterThan(draftPush(140, 100, 100, 100).x);
  });

  it("handles a spark exactly under the pointer without NaN", () => {
    const push = draftPush(100, 100, 100, 100);
    expect(Number.isFinite(push.x)).toBe(true);
    expect(Number.isFinite(push.y)).toBe(true);
  });
});
