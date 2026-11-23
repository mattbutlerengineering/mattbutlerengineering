import { describe, it, expect } from "vitest";
import {
  createFlies,
  createRandom,
  flyCount,
  flyRadius,
  flyTier,
  FLY_COUNT_MAX,
  GOLD_EVERY,
  GOLD_LEVEL_MIN,
  isGoldFly,
  pullFraction,
  pulseLevel,
  spawnFly,
  TIER_GOLD,
  turnRate,
  wrap,
} from "./fireflies-field";

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

describe("flyCount", () => {
  it("is zero for an empty canvas", () => {
    expect(flyCount(0, 400)).toBe(0);
    expect(flyCount(400, 0)).toBe(0);
  });

  it("is sparse and grows with area", () => {
    expect(flyCount(800, 600)).toBeGreaterThan(flyCount(200, 150));
    expect(flyCount(800, 600)).toBeLessThan(FLY_COUNT_MAX + 1);
  });

  it("is capped so a huge canvas stays cheap", () => {
    expect(flyCount(8000, 6000)).toBe(FLY_COUNT_MAX);
  });
});

describe("fly shape", () => {
  it("keeps radii small and bounded", () => {
    expect(flyRadius(0)).toBeGreaterThan(0);
    expect(flyRadius(1)).toBeLessThanOrEqual(3.5);
  });

  it("marks every GOLD_EVERY-th fly gold, at most 5% of a full pool", () => {
    expect(isGoldFly(0)).toBe(true);
    expect(isGoldFly(1)).toBe(false);
    expect(isGoldFly(GOLD_EVERY)).toBe(true);
    let gold = 0;
    for (let i = 0; i < FLY_COUNT_MAX; i++) if (isGoldFly(i)) gold++;
    expect(gold).toBeGreaterThan(0);
    expect(gold / FLY_COUNT_MAX).toBeLessThanOrEqual(0.05);
  });
});

describe("pulseLevel", () => {
  it("stays in [0, 1] and flashes: dark most of the cycle, full at the peak", () => {
    expect(pulseLevel(Math.PI / 2)).toBeCloseTo(1, 5);
    expect(pulseLevel(-Math.PI / 2)).toBeCloseTo(0, 5);
    for (let p = 0; p < 7; p += 0.1) {
      const v = pulseLevel(p);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("flyTier", () => {
  it("draws dim, mid and bright ink as the pulse rises", () => {
    expect(flyTier(1, 0.05)).toBe(0);
    expect(flyTier(1, 0.4)).toBe(1);
    expect(flyTier(1, 0.9)).toBe(2);
  });

  it("makes a fly gold only while it is lit", () => {
    expect(flyTier(0, GOLD_LEVEL_MIN + 0.01)).toBe(TIER_GOLD);
    expect(flyTier(0, 0.05)).toBe(0);
    expect(flyTier(1, 0.95)).not.toBe(TIER_GOLD);
  });
});

describe("turnRate", () => {
  it("is a small bounded turn, left and right", () => {
    expect(Math.abs(turnRate(1.3))).toBeLessThan(0.2);
    expect(turnRate(Math.PI / 2)).toBeGreaterThan(0);
    expect(turnRate(-Math.PI / 2)).toBeLessThan(0);
  });
});

describe("wrap", () => {
  it("re-enters from the opposite edge past a margin", () => {
    expect(wrap(-20, 400, 10)).toBe(410);
    expect(wrap(420, 400, 10)).toBe(-10);
    expect(wrap(200, 400, 10)).toBe(200);
  });
});

describe("pullFraction", () => {
  it("is zero while the pointer has never entered the canvas", () => {
    expect(pullFraction(Number.POSITIVE_INFINITY)).toBe(0);
    expect(pullFraction(Number.NaN)).toBe(0);
  });

  it("draws close flies towards the pointer, by less than the whole way", () => {
    const f = pullFraction(40);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
    expect(pullFraction(40)).toBeGreaterThan(pullFraction(400));
  });

  it("fades to nothing far away", () => {
    expect(pullFraction(3000)).toBeLessThan(1e-6);
  });
});

describe("createFlies / spawnFly", () => {
  it("allocates fixed typed buffers sized to the count", () => {
    const flies = createFlies(12);
    expect(flies.count).toBe(12);
    expect(flies.x).toHaveLength(12);
    expect(flies.phase).toHaveLength(12);
  });

  it("scatters flies inside the canvas with a pulse and a heading", () => {
    const flies = createFlies(40);
    const random = createRandom(3);
    for (let i = 0; i < 40; i++) spawnFly(flies, i, 400, 300, random);
    for (let i = 0; i < 40; i++) {
      expect(flies.x[i]).toBeGreaterThanOrEqual(0);
      expect(flies.x[i]).toBeLessThanOrEqual(400);
      expect(flies.y[i]).toBeGreaterThanOrEqual(0);
      expect(flies.y[i]).toBeLessThanOrEqual(300);
      expect(flies.speed[i]).toBeGreaterThan(0);
      expect(flies.rate[i]).toBeGreaterThan(0);
    }
  });
});
