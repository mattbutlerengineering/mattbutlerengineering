import { describe, it, expect } from "vitest";
import {
  createRandom,
  createWisps,
  envelope,
  GOLD_EVERY,
  GOLD_LEVEL_MIN,
  isGoldWisp,
  sway,
  spawnWisp,
  TIER_GOLD,
  wispCount,
  wispRadius,
  wispTier,
  WISP_COUNT_MAX,
} from "./steam-field";

describe("wispCount", () => {
  it("is zero for an empty canvas", () => {
    expect(wispCount(0, 400)).toBe(0);
    expect(wispCount(400, 0)).toBe(0);
  });

  it("is few, and grows with area", () => {
    expect(wispCount(800, 600)).toBeGreaterThan(wispCount(200, 150));
    expect(wispCount(800, 600)).toBeLessThanOrEqual(WISP_COUNT_MAX);
  });

  it("is capped so a huge canvas stays cheap", () => {
    expect(wispCount(8000, 6000)).toBe(WISP_COUNT_MAX);
  });
});

describe("wisp shape", () => {
  it("makes wisps large", () => {
    expect(wispRadius(0)).toBeGreaterThanOrEqual(30);
    expect(wispRadius(1)).toBeGreaterThan(wispRadius(0));
  });

  it("marks every GOLD_EVERY-th wisp gold, at most 5% of a full pool", () => {
    expect(isGoldWisp(0)).toBe(true);
    expect(isGoldWisp(1)).toBe(false);
    expect(isGoldWisp(GOLD_EVERY)).toBe(true);
    let gold = 0;
    for (let i = 0; i < WISP_COUNT_MAX; i++) if (isGoldWisp(i)) gold++;
    expect(gold).toBeGreaterThan(0);
    expect(gold / WISP_COUNT_MAX).toBeLessThanOrEqual(0.05);
  });
});

describe("envelope", () => {
  it("fades in, peaks mid-rise and fades out, within [0, 1]", () => {
    expect(envelope(0)).toBeCloseTo(0, 5);
    expect(envelope(0.5)).toBeCloseTo(1, 5);
    expect(envelope(1)).toBeCloseTo(0, 5);
    for (let l = 0; l <= 1; l += 0.05) {
      expect(envelope(l)).toBeGreaterThanOrEqual(0);
      expect(envelope(l)).toBeLessThanOrEqual(1);
    }
  });
});

describe("wispTier", () => {
  it("draws dim, mid and bright ink as the wisp thickens", () => {
    expect(wispTier(1, 0.05)).toBe(0);
    expect(wispTier(1, 0.5)).toBe(1);
    expect(wispTier(1, 0.9)).toBe(2);
  });

  it("makes a wisp gold only while it is thick", () => {
    expect(wispTier(0, GOLD_LEVEL_MIN + 0.01)).toBe(TIER_GOLD);
    expect(wispTier(0, 0.05)).toBe(0);
    expect(wispTier(1, 0.95)).not.toBe(TIER_GOLD);
  });
});

describe("sway", () => {
  it("is a gentle bounded side-to-side drift", () => {
    expect(Math.abs(sway(1.3))).toBeLessThanOrEqual(1);
    expect(sway(Math.PI / 2)).toBeGreaterThan(0);
    expect(sway(-Math.PI / 2)).toBeLessThan(0);
  });
});

describe("createWisps / spawnWisp", () => {
  it("allocates fixed typed buffers sized to the count", () => {
    const wisps = createWisps(12);
    expect(wisps.count).toBe(12);
    expect(wisps.x).toHaveLength(12);
    expect(wisps.life).toHaveLength(12);
  });

  it("scatters a first spawn across the canvas, mid-life", () => {
    const wisps = createWisps(30);
    const random = createRandom(3);
    for (let i = 0; i < 30; i++) spawnWisp(wisps, i, 400, 300, random, true);
    for (let i = 0; i < 30; i++) {
      expect(wisps.x[i]).toBeGreaterThanOrEqual(0);
      expect(wisps.x[i]).toBeLessThanOrEqual(400);
      expect(wisps.y[i]).toBeGreaterThanOrEqual(0);
      expect(wisps.y[i]).toBeLessThanOrEqual(300 + wisps.radius[i]!);
      expect(wisps.rise[i]).toBeGreaterThan(0);
    }
  });

  it("respawns a spent wisp low on the canvas at the start of its life", () => {
    const wisps = createWisps(1);
    spawnWisp(wisps, 0, 400, 300, createRandom(5), false);
    expect(wisps.life[0]).toBe(0);
    expect(wisps.y[0]).toBeGreaterThanOrEqual(300);
  });
});
