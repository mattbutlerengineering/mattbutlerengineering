import { describe, it, expect } from "vitest";
import { parseFeatureFlags, isEnabled, isEnabledForSeed, type FeatureFlagMap } from "./index.js";

describe("parseFeatureFlags", () => {
  it("should parse valid JSON header", () => {
    const header = '{"test-flag":{"enabled":true,"percentage":100}}';
    const result = parseFeatureFlags(header);
    expect(result).toHaveProperty("test-flag");
    expect(result["test-flag"].enabled).toBe(true);
  });

  it("should return empty object for null header", () => {
    const result = parseFeatureFlags(null);
    expect(result).toEqual({});
  });

  it("should return empty object for undefined header", () => {
    const result = parseFeatureFlags(undefined);
    expect(result).toEqual({});
  });

  it("should return empty object for invalid JSON", () => {
    const result = parseFeatureFlags("not-json");
    expect(result).toEqual({});
  });
});

describe("isEnabled", () => {
  it("should return true when flag is enabled with 100%", () => {
    const flags: FeatureFlagMap = { "test-flag": { enabled: true, percentage: 100 } };
    expect(isEnabled(flags, "test-flag")).toBe(true);
  });

  it("should return false when flag is disabled", () => {
    const flags: FeatureFlagMap = { "test-flag": { enabled: false, percentage: 100 } };
    expect(isEnabled(flags, "test-flag")).toBe(false);
  });

  it("should return false for missing flag", () => {
    const flags: FeatureFlagMap = {};
    expect(isEnabled(flags, "missing-flag")).toBe(false);
  });

  it("should return false for null flags", () => {
    expect(isEnabled(null, "test-flag")).toBe(false);
  });

  it("should return false for low percentage without seed", () => {
    const flags: FeatureFlagMap = { "test-flag": { enabled: true, percentage: 50 } };
    expect(isEnabled(flags, "test-flag")).toBe(false);
  });
});

describe("isEnabledForSeed", () => {
  it("should return true when flag is enabled with 100%", () => {
    const flags: FeatureFlagMap = { "test-flag": { enabled: true, percentage: 100 } };
    expect(isEnabledForSeed(flags, "test-flag", "user-123")).toBe(true);
  });

  it("should return false when flag is disabled", () => {
    const flags: FeatureFlagMap = { "test-flag": { enabled: false, percentage: 100 } };
    expect(isEnabledForSeed(flags, "test-flag", "user-123")).toBe(false);
  });

  it("should return consistent results for same seed", () => {
    const flags: FeatureFlagMap = { "test-flag": { enabled: true, percentage: 50 } };
    const seed = "consistent-user";
    const result1 = isEnabledForSeed(flags, "test-flag", seed);
    const result2 = isEnabledForSeed(flags, "test-flag", seed);
    expect(result1).toBe(result2);
  });

  it("should distribute roughly evenly at 50%", () => {
    const flags: FeatureFlagMap = { "test-flag": { enabled: true, percentage: 50 } };
    let enabledCount = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (isEnabledForSeed(flags, "test-flag", `user-${i}`)) {
        enabledCount++;
      }
    }
    const percentage = (enabledCount / total) * 100;
    expect(percentage).toBeGreaterThan(40);
    expect(percentage).toBeLessThan(60);
  });

  it("should return false for missing seed", () => {
    const flags: FeatureFlagMap = { "test-flag": { enabled: true, percentage: 50 } };
    expect(isEnabledForSeed(flags, "test-flag", "")).toBe(false);
  });
});
