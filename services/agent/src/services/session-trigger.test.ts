import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentSession } from "@mbe/types";

vi.mock("./session.js", () => ({
  sessionService: {
    create: vi.fn(),
  },
}));

vi.mock("./session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./session-concurrency.js", () => ({
  defaultConcurrency: {
    canStart: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("./logger.js", () => {
  const error = vi.fn();
  return { getServiceLogger: () => ({ error }), setServiceLogger: vi.fn() };
});

import { sessionService } from "./session.js";
import { executeSession } from "./session-executor.js";
import { defaultConcurrency } from "./session-concurrency.js";
import { getServiceLogger } from "./logger.js";
import { triggerSession } from "./session-trigger.js";

const makeSession = (overrides: Partial<AgentSession> = {}): AgentSession => ({
  id: "sess-1",
  status: "pending",
  taskDescription: "<task>\nFix the bug\n</task>",
  userId: null,
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
  createdAt: "2026-03-01T12:00:00.000Z",
  updatedAt: "2026-03-01T12:00:00.000Z",
  ...overrides,
});

describe("triggerSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(defaultConcurrency.canStart).mockReturnValue(true);
    vi.mocked(sessionService.create).mockResolvedValue(makeSession());
  });

  it("creates a session, dispatches execution, returns accepted=true", async () => {
    const result = await triggerSession({
      taskDescription: "Fix the bug",
      baseBranch: "main",
    });

    expect(result.accepted).toBe(true);
    expect(result.session).not.toBeNull();
    expect(result.session!.id).toBe("sess-1");
    expect(sessionService.create).toHaveBeenCalled();
    expect(executeSession).toHaveBeenCalledWith(expect.objectContaining({ id: "sess-1" }));
  });

  it("wraps the task description in <task> tags", async () => {
    await triggerSession({ taskDescription: "Fix the bug", baseBranch: "main" });

    expect(sessionService.create).toHaveBeenCalledWith(
      expect.objectContaining({ taskDescription: "<task>\nFix the bug\n</task>" })
    );
  });

  it("returns accepted=false without a DB write when the concurrency cap is hit", async () => {
    vi.mocked(defaultConcurrency.canStart).mockReturnValue(false);

    const result = await triggerSession({ taskDescription: "Another task" });

    expect(result.accepted).toBe(false);
    expect(result.session).toBeNull();
    expect(sessionService.create).not.toHaveBeenCalled();
    expect(executeSession).not.toHaveBeenCalled();
  });

  it("passes optional fields — including createPr — through to session create", async () => {
    await triggerSession({
      taskDescription: "Big task",
      model: "claude-opus-4-6",
      maxTurns: 100,
      maxBudgetUsd: 5.0,
      baseBranch: "develop",
      createPr: false,
      parentId: "parent-1",
    });

    expect(sessionService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskDescription: expect.stringContaining("Big task"),
        model: "claude-opus-4-6",
        maxTurns: 100,
        maxBudgetUsd: 5.0,
        baseBranch: "develop",
        createPr: false,
        parentId: "parent-1",
      })
    );
  });

  it("passes userId through to session create", async () => {
    await triggerSession({ taskDescription: "Auth task", userId: "auth0|user-1" });

    expect(sessionService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "auth0|user-1" })
    );
  });

  it("calls onSettled(true) when execution succeeds", async () => {
    vi.mocked(executeSession).mockResolvedValueOnce(undefined);
    const onSettled = vi.fn();

    await triggerSession({ taskDescription: "Fix the bug", onSettled });

    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledWith(true));
  });

  it("calls onSettled(false) when execution fails", async () => {
    vi.mocked(executeSession).mockRejectedValueOnce(new Error("SDK crash"));
    const onSettled = vi.fn();

    await triggerSession({ taskDescription: "Fix the bug", onSettled });

    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledWith(false));
  });

  it("logs a failed execution via the structured service logger, not raw console.error (#2888B)", async () => {
    vi.mocked(executeSession).mockRejectedValueOnce(new Error("SDK crash"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await triggerSession({ taskDescription: "Fix the bug" });

    await vi.waitFor(() => expect(getServiceLogger().error).toHaveBeenCalled());
    expect(getServiceLogger().error).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-1", err: expect.any(Error) }),
      expect.any(String)
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("resolves without onSettled when none is provided", async () => {
    vi.mocked(executeSession).mockResolvedValueOnce(undefined);

    await expect(triggerSession({ taskDescription: "Fix the bug" })).resolves.toBeDefined();
  });
});
