import { describe, it, expect } from "vitest";
import { buildOrchestratorPrompt, DEFAULT_ORCHESTRATOR_CONFIG } from "../task-decomposer.js";
import type { OrchestratorConfig } from "../task-decomposer.js";

describe("buildOrchestratorPrompt", () => {
  const baseConfig: OrchestratorConfig = {
    ...DEFAULT_ORCHESTRATOR_CONFIG,
    taskDescription: "Build a notification system",
  };

  it("includes the session model in the prompt", () => {
    const prompt = buildOrchestratorPrompt(baseConfig);
    expect(prompt).toContain(baseConfig.sessionModel);
  });

  it("includes budget per session", () => {
    const prompt = buildOrchestratorPrompt(baseConfig);
    expect(prompt).toContain("$1.00");
  });

  it("includes max concurrent sessions", () => {
    const prompt = buildOrchestratorPrompt(baseConfig);
    expect(prompt).toContain("3");
  });

  it("includes base branch", () => {
    const prompt = buildOrchestratorPrompt(baseConfig);
    expect(prompt).toContain("main");
  });

  it("includes decomposition guidelines", () => {
    const prompt = buildOrchestratorPrompt(baseConfig);
    expect(prompt).toContain("Decomposition Guidelines");
    expect(prompt).toContain("Identify independent units");
  });

  it("includes tool descriptions", () => {
    const prompt = buildOrchestratorPrompt(baseConfig);
    expect(prompt).toContain("create_session");
    expect(prompt).toContain("check_session");
    expect(prompt).toContain("list_sessions");
    expect(prompt).toContain("cancel_session");
  });

  it("includes workflow instructions", () => {
    const prompt = buildOrchestratorPrompt(baseConfig);
    expect(prompt).toContain("Workflow");
    expect(prompt).toContain("Poll session status");
  });

  it("reflects custom configuration", () => {
    const customConfig: OrchestratorConfig = {
      ...baseConfig,
      sessionModel: "claude-haiku-4-5",
      maxBudgetPerSession: 0.5,
      maxConcurrentSessions: 5,
      baseBranch: "develop",
    };

    const prompt = buildOrchestratorPrompt(customConfig);
    expect(prompt).toContain("claude-haiku-4-5");
    expect(prompt).toContain("$0.50");
    expect(prompt).toContain("5");
    expect(prompt).toContain("develop");
  });
});

describe("DEFAULT_ORCHESTRATOR_CONFIG", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_ORCHESTRATOR_CONFIG.model).toBe("claude-sonnet-4-6");
    expect(DEFAULT_ORCHESTRATOR_CONFIG.sessionModel).toBe("claude-sonnet-4-6");
    expect(DEFAULT_ORCHESTRATOR_CONFIG.maxBudgetPerSession).toBe(1.0);
    expect(DEFAULT_ORCHESTRATOR_CONFIG.maxTurnsPerSession).toBe(50);
    expect(DEFAULT_ORCHESTRATOR_CONFIG.baseBranch).toBe("main");
    expect(DEFAULT_ORCHESTRATOR_CONFIG.maxConcurrentSessions).toBe(3);
    expect(DEFAULT_ORCHESTRATOR_CONFIG.apiBaseUrl).toBe("http://localhost:3003");
  });
});
