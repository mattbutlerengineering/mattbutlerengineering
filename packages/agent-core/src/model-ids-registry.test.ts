import { describe, it, expect } from "vitest";
import { resolveModelId, MODEL_IDS, TIER_DOWNGRADE } from "./model-registry.js";
import type { ModelTier } from "./model-router.js";
import { DEFAULT_EVALUATION_CONFIG } from "./success-evaluator.js";
import { DEFAULT_REVIEW_CONFIG } from "./diff-reviewer.js";
import { DEFAULT_SESSION_CONFIG } from "./types.js";
import { DEFAULT_ORCHESTRATOR_CONFIG } from "./task-decomposer.js";

describe("model ID registry consistency", () => {
  describe("MODEL_IDS — all tiers defined", () => {
    it("has entries for every ModelTier", () => {
      const tiers: ModelTier[] = ["haiku", "sonnet", "opus"];
      for (const tier of tiers) {
        expect(MODEL_IDS[tier]).toBeTruthy();
      }
    });

    it("a model-ID bump is a one-file change — callers get the updated ID via resolveModelId", () => {
      // resolveModelId("haiku") must return whatever MODEL_IDS.haiku says
      expect(resolveModelId("haiku")).toBe(MODEL_IDS.haiku);
      expect(resolveModelId("sonnet")).toBe(MODEL_IDS.sonnet);
      expect(resolveModelId("opus")).toBe(MODEL_IDS.opus);
    });
  });

  describe("TIER_DOWNGRADE — downgrade chain", () => {
    it("opus downgrades to sonnet", () => {
      expect(TIER_DOWNGRADE.opus).toBe("sonnet");
    });

    it("sonnet downgrades to haiku", () => {
      expect(TIER_DOWNGRADE.sonnet).toBe("haiku");
    });

    it("haiku stays haiku (floor)", () => {
      expect(TIER_DOWNGRADE.haiku).toBe("haiku");
    });
  });

  describe("stale haiku IDs (active bug)", () => {
    it("success-evaluator default config uses the canonical haiku ID", () => {
      expect(DEFAULT_EVALUATION_CONFIG.model).toBe(resolveModelId("haiku"));
    });

    it("diff-reviewer default config uses the canonical haiku ID", () => {
      expect(DEFAULT_REVIEW_CONFIG.model).toBe(resolveModelId("haiku"));
    });
  });

  describe("hardcoded but correct IDs (should use registry)", () => {
    it("types.ts default session config uses the canonical sonnet ID", () => {
      expect(DEFAULT_SESSION_CONFIG.model).toBe(resolveModelId("sonnet"));
    });

    it("task-decomposer orchestrator model uses the canonical sonnet ID", () => {
      expect(DEFAULT_ORCHESTRATOR_CONFIG.model).toBe(resolveModelId("sonnet"));
    });

    it("task-decomposer session model uses the canonical sonnet ID", () => {
      expect(DEFAULT_ORCHESTRATOR_CONFIG.sessionModel).toBe(resolveModelId("sonnet"));
    });
  });
});
