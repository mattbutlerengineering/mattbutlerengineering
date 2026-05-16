import { describe, it, expect } from "vitest";
import {
  AgentSessionSchema,
  AgentSessionStatusSchema,
  AgentSessionEventSchema,
  CreateAgentSessionRequestSchema,
} from "./schemas/agent.js";

describe("AgentSessionStatusSchema", () => {
  const validStatuses = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"];

  it.each(validStatuses)("accepts valid status: %s", (status) => {
    expect(AgentSessionStatusSchema.safeParse(status).success).toBe(true);
  });

  it("rejects lowercase variants", () => {
    expect(AgentSessionStatusSchema.safeParse("pending").success).toBe(false);
    expect(AgentSessionStatusSchema.safeParse("running").success).toBe(false);
  });

  it("rejects unknown statuses", () => {
    expect(AgentSessionStatusSchema.safeParse("INVALID").success).toBe(false);
    expect(AgentSessionStatusSchema.safeParse("QUEUED").success).toBe(false);
    expect(AgentSessionStatusSchema.safeParse("").success).toBe(false);
  });

  it("rejects non-string types", () => {
    expect(AgentSessionStatusSchema.safeParse(42).success).toBe(false);
    expect(AgentSessionStatusSchema.safeParse(null).success).toBe(false);
    expect(AgentSessionStatusSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("AgentSessionSchema", () => {
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
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  };

  it("accepts a fully populated valid session", () => {
    const populated = {
      ...validSession,
      status: "SUCCEEDED",
      branchName: "fix/login-bug",
      prUrl: "https://github.com/org/repo/pull/42",
      prNumber: 42,
      resultText: "Fixed the login bug",
      costUsd: 0.85,
      inputTokens: 12000,
      outputTokens: 3500,
      numTurns: 15,
      durationMs: 45000,
      parentId: "parent-session-1",
      errors: ["Warning: rate limited once"],
      startedAt: "2026-05-10T00:01:00.000Z",
      completedAt: "2026-05-10T00:02:00.000Z",
      createPr: true,
    };
    const result = AgentSessionSchema.safeParse(populated);
    expect(result.success).toBe(true);
  });

  it("accepts a minimal valid session with all nullable fields null", () => {
    const result = AgentSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { id: _, ...noId } = validSession;
    expect(AgentSessionSchema.safeParse(noId).success).toBe(false);

    const { taskDescription: _td, ...noTask } = validSession;
    expect(AgentSessionSchema.safeParse(noTask).success).toBe(false);

    const { baseBranch: _bb, ...noBranch } = validSession;
    expect(AgentSessionSchema.safeParse(noBranch).success).toBe(false);

    const { model: _m, ...noModel } = validSession;
    expect(AgentSessionSchema.safeParse(noModel).success).toBe(false);

    const { errors: _e, ...noErrors } = validSession;
    expect(AgentSessionSchema.safeParse(noErrors).success).toBe(false);
  });

  it("rejects invalid status values", () => {
    const result = AgentSessionSchema.safeParse({ ...validSession, status: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("rejects wrong types for numeric fields", () => {
    expect(AgentSessionSchema.safeParse({ ...validSession, maxTurns: "50" }).success).toBe(false);
    expect(AgentSessionSchema.safeParse({ ...validSession, maxBudgetUsd: "1.0" }).success).toBe(
      false
    );
  });

  it("rejects non-array errors field", () => {
    expect(AgentSessionSchema.safeParse({ ...validSession, errors: "error" }).success).toBe(false);
    expect(AgentSessionSchema.safeParse({ ...validSession, errors: null }).success).toBe(false);
  });

  it("accepts errors array with multiple entries", () => {
    const result = AgentSessionSchema.safeParse({
      ...validSession,
      errors: ["err1", "err2", "err3"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-string values in errors array", () => {
    const result = AgentSessionSchema.safeParse({
      ...validSession,
      errors: [42, "valid"],
    });
    expect(result.success).toBe(false);
  });
});

describe("AgentSessionEventSchema", () => {
  it("accepts a valid event with data", () => {
    const event = {
      id: "evt-1",
      sessionId: "session-1",
      type: "TOOL_CALL",
      data: { tool: "ls", args: ["-la"] },
      createdAt: "2026-05-10T00:00:00.000Z",
    };
    expect(AgentSessionEventSchema.safeParse(event).success).toBe(true);
  });

  it("accepts an event without data (optional)", () => {
    const event = {
      id: "evt-2",
      sessionId: "session-1",
      type: "MESSAGE",
      createdAt: "2026-05-10T00:00:00.000Z",
    };
    expect(AgentSessionEventSchema.safeParse(event).success).toBe(true);
  });

  it("accepts an event with empty data object", () => {
    const event = {
      id: "evt-3",
      sessionId: "session-1",
      type: "START",
      data: {},
      createdAt: "2026-05-10T00:00:00.000Z",
    };
    expect(AgentSessionEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(
      AgentSessionEventSchema.safeParse({ sessionId: "s1", type: "X", createdAt: "t" }).success
    ).toBe(false);
    expect(AgentSessionEventSchema.safeParse({ id: "e1", type: "X", createdAt: "t" }).success).toBe(
      false
    );
    expect(
      AgentSessionEventSchema.safeParse({ id: "e1", sessionId: "s1", createdAt: "t" }).success
    ).toBe(false);
    expect(
      AgentSessionEventSchema.safeParse({ id: "e1", sessionId: "s1", type: "X" }).success
    ).toBe(false);
  });

  it("rejects non-string id", () => {
    const event = { id: 123, sessionId: "s1", type: "X", createdAt: "t" };
    expect(AgentSessionEventSchema.safeParse(event).success).toBe(false);
  });
});

describe("CreateAgentSessionRequestSchema", () => {
  it("accepts a minimal valid request", () => {
    const req = { taskDescription: "Fix the bug" };
    expect(CreateAgentSessionRequestSchema.safeParse(req).success).toBe(true);
  });

  it("accepts a fully specified request", () => {
    const req = {
      taskDescription: "Refactor auth module",
      model: "claude-sonnet-4-6",
      maxTurns: 30,
      maxBudgetUsd: 5.0,
      baseBranch: "develop",
      createPr: true,
      parentId: "parent-123",
    };
    expect(CreateAgentSessionRequestSchema.safeParse(req).success).toBe(true);
  });

  it("rejects empty taskDescription", () => {
    const req = { taskDescription: "" };
    const result = CreateAgentSessionRequestSchema.safeParse(req);
    expect(result.success).toBe(false);
  });

  it("rejects taskDescription exceeding 10,000 chars", () => {
    const req = { taskDescription: "x".repeat(10_001) };
    const result = CreateAgentSessionRequestSchema.safeParse(req);
    expect(result.success).toBe(false);
  });

  it("accepts taskDescription at max boundary (10,000 chars)", () => {
    const req = { taskDescription: "x".repeat(10_000) };
    const result = CreateAgentSessionRequestSchema.safeParse(req);
    expect(result.success).toBe(true);
  });

  it("rejects maxTurns below minimum (1)", () => {
    const req = { taskDescription: "task", maxTurns: 0 };
    expect(CreateAgentSessionRequestSchema.safeParse(req).success).toBe(false);
  });

  it("rejects maxTurns above maximum (200)", () => {
    const req = { taskDescription: "task", maxTurns: 201 };
    expect(CreateAgentSessionRequestSchema.safeParse(req).success).toBe(false);
  });

  it("accepts maxTurns at boundaries", () => {
    expect(
      CreateAgentSessionRequestSchema.safeParse({ taskDescription: "t", maxTurns: 1 }).success
    ).toBe(true);
    expect(
      CreateAgentSessionRequestSchema.safeParse({ taskDescription: "t", maxTurns: 200 }).success
    ).toBe(true);
  });

  it("rejects maxBudgetUsd below minimum (0.01)", () => {
    const req = { taskDescription: "task", maxBudgetUsd: 0.001 };
    expect(CreateAgentSessionRequestSchema.safeParse(req).success).toBe(false);
  });

  it("rejects maxBudgetUsd above maximum (10.0)", () => {
    const req = { taskDescription: "task", maxBudgetUsd: 10.01 };
    expect(CreateAgentSessionRequestSchema.safeParse(req).success).toBe(false);
  });

  it("accepts maxBudgetUsd at boundaries", () => {
    expect(
      CreateAgentSessionRequestSchema.safeParse({ taskDescription: "t", maxBudgetUsd: 0.01 })
        .success
    ).toBe(true);
    expect(
      CreateAgentSessionRequestSchema.safeParse({ taskDescription: "t", maxBudgetUsd: 10.0 })
        .success
    ).toBe(true);
  });

  it("rejects missing taskDescription", () => {
    const req = { model: "sonnet" };
    expect(CreateAgentSessionRequestSchema.safeParse(req).success).toBe(false);
  });

  it("rejects non-boolean createPr", () => {
    const req = { taskDescription: "task", createPr: "yes" };
    expect(CreateAgentSessionRequestSchema.safeParse(req).success).toBe(false);
  });
});
