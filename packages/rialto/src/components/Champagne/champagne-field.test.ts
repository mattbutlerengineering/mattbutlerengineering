import { describe, it, expect } from "vitest";
import {
  BUBBLE_COUNT_MAX,
  bubbleCount,
  bubbleRadius,
  bubbleSpeed,
  createBubbles,
  createRandom,
  GOLD_EVERY,
  isGoldBubble,
  pointerPush,
  spawnBubble,
  swayOffset,
} from "./champagne-field";

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

describe("bubbleCount", () => {
  it("is zero for an empty canvas", () => {
    expect(bubbleCount(0, 400)).toBe(0);
    expect(bubbleCount(400, 0)).toBe(0);
  });

  it("grows with area", () => {
    expect(bubbleCount(800, 600)).toBeGreaterThan(bubbleCount(200, 150));
  });

  it("is capped so a huge canvas stays cheap", () => {
    expect(bubbleCount(8000, 6000)).toBe(BUBBLE_COUNT_MAX);
  });
});

describe("bubble shape", () => {
  it("keeps radii in a bounded range, small ones more common", () => {
    expect(bubbleRadius(0)).toBeGreaterThan(0);
    expect(bubbleRadius(1)).toBeLessThanOrEqual(7);
    expect(bubbleRadius(0.5)).toBeLessThan((bubbleRadius(0) + bubbleRadius(1)) / 2);
  });

  it("rises faster for bigger bubbles", () => {
    expect(bubbleSpeed(6)).toBeGreaterThan(bubbleSpeed(2));
  });

  it("marks every GOLD_EVERY-th bubble gold", () => {
    expect(isGoldBubble(0)).toBe(true);
    expect(isGoldBubble(1)).toBe(false);
    expect(isGoldBubble(GOLD_EVERY)).toBe(true);
  });

  // Issue #9343: gold is 5% of bubbles, the same surgical share as SilkFlow.
  it("keeps gold to at most 5% of a full pool", () => {
    let gold = 0;
    for (let i = 0; i < BUBBLE_COUNT_MAX; i++) {
      if (isGoldBubble(i)) gold++;
    }
    expect(gold).toBeGreaterThan(0);
    expect(gold / BUBBLE_COUNT_MAX).toBeLessThanOrEqual(0.05);
  });
});

describe("swayOffset", () => {
  it("is bounded and varies with height", () => {
    const a = swayOffset(0.4, 100);
    const b = swayOffset(0.4, 180);
    expect(Math.abs(a)).toBeLessThanOrEqual(12);
    expect(a).not.toBe(b);
  });
});

describe("pointerPush", () => {
  it("is zero while the pointer has never entered the canvas", () => {
    expect(pointerPush(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(0);
    expect(pointerPush(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("pushes a bubble away from the pointer, hardest when close", () => {
    expect(pointerPush(10, 0)).toBeGreaterThan(0);
    expect(pointerPush(-10, 0)).toBeLessThan(0);
    expect(Math.abs(pointerPush(10, 0))).toBeGreaterThan(Math.abs(pointerPush(200, 0)));
  });

  it("fades to nothing far away", () => {
    expect(Math.abs(pointerPush(2000, 0))).toBeLessThan(1e-6);
  });
});

describe("spawnBubble / createBubbles", () => {
  it("allocates fixed typed buffers sized to the count", () => {
    const bubbles = createBubbles(12);
    expect(bubbles.count).toBe(12);
    expect(bubbles.x).toHaveLength(12);
    expect(bubbles.y).toHaveLength(12);
  });

  it("spawns below the bottom edge when respawning, anywhere on first fill", () => {
    const bubbles = createBubbles(40);
    const random = createRandom(3);
    for (let i = 0; i < 40; i++) spawnBubble(bubbles, i, 400, 300, random, false);
    for (let i = 0; i < 40; i++) {
      expect(bubbles.y[i]).toBeGreaterThanOrEqual(300);
      expect(bubbles.x[i]).toBeGreaterThanOrEqual(0);
      expect(bubbles.x[i]).toBeLessThanOrEqual(400);
    }
    for (let i = 0; i < 40; i++) spawnBubble(bubbles, i, 400, 300, random, true);
    expect(Array.from(bubbles.y).some((y) => y < 300)).toBe(true);
  });
});
