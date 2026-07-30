import { describe, it, expect } from "vitest";
import { createValueNoise, silkParticleCount, silkStrandAngle } from "./silk-flow-field";

describe("createValueNoise", () => {
  it("stays within the unit interval across a wide sample", () => {
    const noise = createValueNoise();
    for (let i = 0; i < 500; i++) {
      const v = noise(i * 0.37 - 90, i * -1.13 + 12.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic — same coordinate yields the same value", () => {
    const noise = createValueNoise();
    expect(noise(3.25, -7.5)).toBe(noise(3.25, -7.5));
  });

  it("is continuous — nearby coordinates yield nearby values", () => {
    const noise = createValueNoise();
    const a = noise(10, 10);
    const b = noise(10.001, 10.001);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });

  it("varies across the field — not a constant function", () => {
    const noise = createValueNoise();
    const samples = new Set([noise(0, 0), noise(5, 0), noise(0, 5), noise(5, 5)]);
    expect(samples.size).toBeGreaterThan(1);
  });
});

describe("silkParticleCount", () => {
  it("scales with viewport area", () => {
    expect(silkParticleCount(1280, 720)).toBe(Math.floor((1280 * 720) / 4500));
  });

  it("caps at 420 particles on large viewports", () => {
    expect(silkParticleCount(2560, 1440)).toBe(420);
  });

  it("keeps a floor of 150 particles on small viewports", () => {
    expect(silkParticleCount(320, 400)).toBe(150);
    expect(silkParticleCount(0, 0)).toBe(150);
  });
});

describe("silkStrandAngle", () => {
  it("spans multiple field turns so strands curl rather than drift straight", () => {
    const noise = createValueNoise();
    const angles = Array.from({ length: 200 }, (_, i) => silkStrandAngle(noise, i * 37, i * 53, 0));
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(Math.PI * 2);
  });

  it("advances with time at a fixed coordinate", () => {
    const noise = createValueNoise();
    expect(silkStrandAngle(noise, 100, 100, 0)).not.toBe(silkStrandAngle(noise, 100, 100, 5));
  });
});
