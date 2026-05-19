import { describe, it, expect } from "vitest";
import { resolveModelId } from "./model-router.js";
import { DEFAULT_EVALUATION_CONFIG } from "./success-evaluator.js";
import { DEFAULT_REVIEW_CONFIG } from "./diff-reviewer.js";
import { DEFAULT_SESSION_CONFIG } from "./types.js";
import { DEFAULT_ORCHESTRATOR_CONFIG } from "./task-decomposer.js";

describe("model ID registry consistency", () => {
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
