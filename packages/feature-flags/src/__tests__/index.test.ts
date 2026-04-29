import { describe, it, expect } from "vitest";
import { isEnabled, isEnabledForSeed, parseFeatureFlags } from "../index.js";

describe("feature-flags", () => {
  describe("isEnabled", () => {
    it("returns false if flags are null", () => {
      expect(isEnabled(null, "test")).toBe(false);
    });

    it("returns false if flag is missing", () => {
      expect(isEnabled({}, "test")).toBe(false);
    });

    it("returns false if flag is disabled", () => {
      expect(isEnabled({ test: { enabled: false, percentage: 100 } }, "test")).toBe(false);
    });

    it("returns true if flag is enabled and percentage is 100", () => {
      expect(isEnabled({ test: { enabled: true, percentage: 100 } }, "test")).toBe(true);
    });
  });

  describe("isEnabledForSeed", () => {
    it("handles percentage-based rollout", () => {
      const flags = { test: { enabled: true, percentage: 50 } };
      // These seeds should be consistent
      expect(isEnabledForSeed(flags, "test", "seed-1")).toBe(isEnabledForSeed(flags, "test", "seed-1"));
    });
  });

  describe("parseFeatureFlags", () => {
    it("parses valid JSON", () => {
      const header = '{"test":{"enabled":true,"percentage":100}}';
      expect(parseFeatureFlags(header)).toEqual({ test: { enabled: true, percentage: 100 } });
    });

    it("returns empty object for invalid JSON", () => {
      expect(parseFeatureFlags("invalid")).toEqual({});
    });
  });
});
