import { describe, it, expect } from "vitest";
import {
  createMotes,
  createRandom,
  GOLD_EVERY,
  GOLD_LIGHT_MIN,
  isGoldMote,
  MOTE_COUNT_MAX,
  moteCount,
  moteRadius,
  moteTier,
  pointerPush,
  shaftCentre,
  shaftGradientLine,
  shaftLight,
  spawnMote,
  swayOffset,
  TIER_GOLD,
} from "./dust-motes-field";

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

describe("moteCount", () => {
  it("is zero for an empty canvas", () => {
    expect(moteCount(0, 400)).toBe(0);
    expect(moteCount(400, 0)).toBe(0);
  });

  it("grows with area", () => {
    expect(moteCount(800, 600)).toBeGreaterThan(moteCount(200, 150));
  });

  it("is capped so a huge canvas stays cheap", () => {
    expect(moteCount(8000, 6000)).toBe(MOTE_COUNT_MAX);
  });
});

describe("mote shape", () => {
  it("keeps radii small and bounded, the tiny ones more common", () => {
    expect(moteRadius(0)).toBeGreaterThan(0);
    expect(moteRadius(1)).toBeLessThanOrEqual(3);
    expect(moteRadius(0.5)).toBeLessThan((moteRadius(0) + moteRadius(1)) / 2);
  });

  it("marks every GOLD_EVERY-th mote gold", () => {
    expect(isGoldMote(0)).toBe(true);
    expect(isGoldMote(1)).toBe(false);
    expect(isGoldMote(GOLD_EVERY)).toBe(true);
  });

  // Gold is a 5% accent, the same surgical share as SilkFlow.
  it("keeps gold to at most 5% of a full pool", () => {
    let gold = 0;
    for (let i = 0; i < MOTE_COUNT_MAX; i++) {
      if (isGoldMote(i)) gold++;
    }
    expect(gold).toBeGreaterThan(0);
    expect(gold / MOTE_COUNT_MAX).toBeLessThanOrEqual(0.05);
  });
});

describe("swayOffset", () => {
  it("is bounded and varies with height", () => {
    const a = swayOffset(0.4, 100);
    const b = swayOffset(0.4, 180);
    expect(Math.abs(a)).toBeLessThanOrEqual(7);
    expect(a).not.toBe(b);
  });
});

describe("light shaft", () => {
  it("leans from upper right to lower left", () => {
    expect(shaftCentre(0, 800, 600)).toBeGreaterThan(shaftCentre(600, 800, 600));
  });

  it("is brightest on the centre line and fades to nothing away from it", () => {
    const centre = shaftCentre(300, 800, 600);
    expect(shaftLight(centre, 300, 800, 600)).toBeCloseTo(1, 5);
    expect(shaftLight(centre + 120, 300, 800, 600)).toBeLessThan(
      shaftLight(centre + 40, 300, 800, 600)
    );
    expect(shaftLight(centre + 2000, 300, 800, 600)).toBeLessThan(1e-6);
  });

  it("is dark on an empty canvas", () => {
    expect(shaftLight(0, 0, 0, 0)).toBe(0);
  });

  it("spans the shaft's glow across its centre line", () => {
    const { x0, x1, y0, y1 } = shaftGradientLine(800, 600);
    const centre = shaftCentre(300, 800, 600);
    expect(x0).toBeLessThan(centre);
    expect(x1).toBeGreaterThan(centre);
    expect(y0).toBe(y1);
  });
});

describe("moteTier", () => {
  it("draws dim, mid and lit ink as the light rises", () => {
    expect(moteTier(1, 0.05)).toBe(0);
    expect(moteTier(1, 0.4)).toBe(1);
    expect(moteTier(1, 0.9)).toBe(2);
  });

  it("makes a mote gold only while the light catches it", () => {
    expect(moteTier(0, GOLD_LIGHT_MIN + 0.01)).toBe(TIER_GOLD);
    expect(moteTier(0, 0.05)).toBe(0);
    expect(moteTier(1, 0.95)).not.toBe(TIER_GOLD);
  });
});

describe("pointerPush", () => {
  it("is zero while the pointer has never entered the canvas", () => {
    expect(pointerPush(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(0);
    expect(pointerPush(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("pushes a mote away from the pointer, hardest when close", () => {
    expect(pointerPush(10, 0)).toBeGreaterThan(0);
    expect(pointerPush(-10, 0)).toBeLessThan(0);
    expect(Math.abs(pointerPush(10, 0))).toBeGreaterThan(Math.abs(pointerPush(200, 0)));
  });

  it("fades to nothing far away", () => {
    expect(Math.abs(pointerPush(2000, 0))).toBeLessThan(1e-6);
  });
});

describe("spawnMote / createMotes", () => {
  it("allocates fixed typed buffers sized to the count", () => {
    const motes = createMotes(12);
    expect(motes.count).toBe(12);
    expect(motes.x).toHaveLength(12);
    expect(motes.y).toHaveLength(12);
  });

  it("respawns above the top edge and falls, scattered over the height on first fill", () => {
    const motes = createMotes(40);
    const random = createRandom(3);
    for (let i = 0; i < 40; i++) spawnMote(motes, i, 400, 300, random, false);
    for (let i = 0; i < 40; i++) {
      expect(motes.y[i]).toBeLessThan(0);
      expect(motes.fall[i]).toBeGreaterThan(0);
      expect(motes.x[i]).toBeGreaterThanOrEqual(0);
      expect(motes.x[i]).toBeLessThanOrEqual(400);
    }
    for (let i = 0; i < 40; i++) spawnMote(motes, i, 400, 300, random, true);
    expect(Array.from(motes.y).some((y) => y > 0)).toBe(true);
  });
});
