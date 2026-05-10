import { describe, it, expect } from "vitest";
import { 
  AgentSessionSchema,
  AgentSessionStatusSchema,
  AgentSessionEventSchema,
  CreateAgentSessionRequestSchema
} from "./schemas/agent.js";

describe("Agent Schemas", () => {
  it("validates a valid agent session", () => {
    const validSession = {
      id: "session-456",
      status: "RUNNING",
      taskDescription: "Running task",
      branchName: null,
      baseBranch: "main",
      model: "claude-sonnet-4-6",
      maxTurns: 50,
      maxBudgetUsd: 1.0,
      prUrl: null,
      prNumber: null,
      resultText: null,
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      numTurns: null,
      durationMs: null,
      parentId: null,
      errors: [],
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = AgentSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it("validates valid status", () => {
    expect(AgentSessionStatusSchema.safeParse("RUNNING").success).toBe(true);
    expect(AgentSessionStatusSchema.safeParse("INVALID").success).toBe(false);
  });

  it("validates session events", () => {
    const event = {
      id: "evt-1",
      sessionId: "s1",
      type: "TOOL_CALL",
      data: { tool: "ls" },
      createdAt: new Date().toISOString(),
    };
    expect(AgentSessionEventSchema.safeParse(event).success).toBe(true);
  });

  it("validates create session request", () => {
    const req = {
      taskDescription: "Fix bugs",
      model: "sonnet",
      maxTurns: 10,
    };
    expect(CreateAgentSessionRequestSchema.safeParse(req).success).toBe(true);
  });
});
