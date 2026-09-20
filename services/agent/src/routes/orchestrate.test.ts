import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { calculateCost } from "@mbe/agent-test-utils";

// Mock all dependencies
vi.mock("../services/session.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    sessionService: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
      addEvent: vi.fn(),
      listEvents: vi.fn(),
    },
  };
});

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn().mockReturnValue(0),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("@mbe/agent-core", () => ({
  runOrchestrator: vi.fn(),
  DEFAULT_ORCHESTRATOR_CONFIG: {
    apiBaseUrl: "http://localhost:3003",
    model: "claude-sonnet-4-6",
    sessionModel: "claude-sonnet-4-6",
    maxBudgetPerSession: 1.0,
    maxTurnsPerSession: 50,
    baseBranch: "main",
    maxConcurrentSessions: 3,
  },
}));

import { sessionService } from "../services/session.js";
import { runOrchestrator } from "@mbe/agent-core";
import { defaultConcurrency } from "../services/session-concurrency.js";
import { buildApp } from "../app.js";

const mockParentSession = {
  id: "parent-session-1",
  status: "pending" as const,
  taskDescription: "[Orchestrator] Build a notification system",
  userId: null,
  branchName: null,
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 200,
  maxBudgetUsd: 6.0,
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
  createdAt: "2026-02-27T00:00:00.000Z",
  updatedAt: "2026-02-27T00:00:00.000Z",
};

describe("Orchestrate Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("POST /v1/orchestrate", () => {
    it("creates a parent session and runs the orchestrator", async () => {
      vi.mocked(sessionService.create).mockResolvedValueOnce(mockParentSession);
      vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
      vi.mocked(sessionService.addEvent).mockResolvedValue({
        id: "event-1",
        sessionId: "parent-session-1",
        type: "orchestrator:start",
        data: {},
        createdAt: "2026-02-27T00:00:00.000Z",
      });

      const expectedCost = calculateCost(
        {
          inputTokens: 300000,
          outputTokens: 50000,
        },
        "claude-sonnet-4-6"
      ).totalCostUsd;

      vi.mocked(runOrchestrator).mockResolvedValueOnce({
        status: "succeeded",
        childSessionIds: ["child-1", "child-2"],
        summary: "All tasks completed",
        totalCostUsd: expectedCost,
        durationMs: 30000,
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: {
          taskDescription: "Build a notification system",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.parentSessionId).toBe("parent-session-1");
      expect(body.data.status).toBe("succeeded");
      expect(body.data.childSessionIds).toEqual(["child-1", "child-2"]);
      expect(body.data.totalCostUsd).toBe(expectedCost);
    });

    it("creates parent session with orchestrator prefix", async () => {
      vi.mocked(sessionService.create).mockResolvedValueOnce(mockParentSession);
      vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
      vi.mocked(sessionService.addEvent).mockResolvedValue({
        id: "event-1",
        sessionId: "parent-session-1",
        type: "orchestrator:start",
        data: {},
        createdAt: "2026-02-27T00:00:00.000Z",
      });

      vi.mocked(runOrchestrator).mockResolvedValueOnce({
        status: "succeeded",
        childSessionIds: [],
        summary: "Done",
        totalCostUsd: 0.05,
        durationMs: 5000,
      });

      await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: { taskDescription: "Simple task" },
      });

      expect(vi.mocked(sessionService.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          taskDescription: "[Orchestrator] Simple task",
        })
      );
    });

    it("marks parent session as FAILED when orchestrator fails", async () => {
      vi.mocked(sessionService.create).mockResolvedValueOnce(mockParentSession);
      vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
      vi.mocked(sessionService.addEvent).mockResolvedValue({
        id: "event-1",
        sessionId: "parent-session-1",
        type: "orchestrator:start",
        data: {},
        createdAt: "2026-02-27T00:00:00.000Z",
      });

      vi.mocked(runOrchestrator).mockResolvedValueOnce({
        status: "failed",
        childSessionIds: ["child-1"],
        summary: "All sessions failed",
        totalCostUsd: 0.8,
        durationMs: 15000,
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: { taskDescription: "Failing task" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("failed");

      // Should have been called with RUNNING then FAILED
      const updateCalls = vi.mocked(sessionService.updateStatus).mock.calls;
      expect(updateCalls[0]?.[1]).toBe("RUNNING");
      expect(updateCalls[1]?.[1]).toBe("FAILED");
    });

    it("keeps parent session RUNNING when orchestrator reports in_progress", async () => {
      vi.mocked(sessionService.create).mockResolvedValueOnce(mockParentSession);
      vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
      vi.mocked(sessionService.addEvent).mockResolvedValue({
        id: "event-1",
        sessionId: "parent-session-1",
        type: "orchestrator:start",
        data: {},
        createdAt: "2026-02-27T00:00:00.000Z",
      });

      vi.mocked(runOrchestrator).mockResolvedValueOnce({
        status: "in_progress",
        childSessionIds: ["child-1"],
        summary: "Still working",
        totalCostUsd: 0.2,
        durationMs: 10000,
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: { taskDescription: "Long-running task" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("in_progress");

      // Should have been called with RUNNING then RUNNING again — never a false FAILED
      const updateCalls = vi.mocked(sessionService.updateStatus).mock.calls;
      expect(updateCalls[0]?.[1]).toBe("RUNNING");
      expect(updateCalls[1]?.[1]).toBe("RUNNING");
    });

    it("passes custom configuration to the orchestrator", async () => {
      vi.mocked(sessionService.create).mockResolvedValueOnce(mockParentSession);
      vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
      vi.mocked(sessionService.addEvent).mockResolvedValue({
        id: "event-1",
        sessionId: "parent-session-1",
        type: "orchestrator:start",
        data: {},
        createdAt: "2026-02-27T00:00:00.000Z",
      });

      vi.mocked(runOrchestrator).mockResolvedValueOnce({
        status: "succeeded",
        childSessionIds: [],
        summary: "Done",
        totalCostUsd: 0.01,
        durationMs: 2000,
      });

      await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: {
          taskDescription: "Custom task",
          sessionModel: "claude-haiku-4-5",
          maxBudgetPerSession: 0.5,
          maxConcurrentSessions: 2,
        },
      });

      expect(vi.mocked(runOrchestrator)).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionModel: "claude-haiku-4-5",
          maxBudgetPerSession: 0.5,
          maxConcurrentSessions: 2,
        }),
        expect.any(Function)
      );
    });

    it("returns 400 for missing taskDescription", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: {},
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 for maxBudgetPerSession above the per-session cap", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: {
          taskDescription: "Task",
          maxBudgetPerSession: 999999,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 for maxTurnsPerSession above the per-session cap", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: {
          taskDescription: "Task",
          maxTurnsPerSession: 100000,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 for maxConcurrentSessions above the cap", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: {
          taskDescription: "Task",
          maxConcurrentSessions: 999999,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  /**
   * #5148: orchestrate created its parent session with `sessionService.create()`
   * and ran it through `runOrchestrator()` inline, never touching the admission
   * path `POST /v1/sessions` uses. The parent was invisible to the gate, so an
   * authenticated caller could start unbounded concurrent orchestrations — each
   * holding a request thread and each able to spawn `maxConcurrentSessions`
   * children — while the service was already at `MAX_CONCURRENT_SESSIONS`.
   *
   * A `canStart()`-only check would NOT have fixed this: parents never entered
   * the active set, so the check could never go false no matter how many
   * orchestrations were in flight. The slot has to actually be reserved, which
   * is what these tests pin.
   */
  describe("concurrency admission (#5148)", () => {
    const held: string[] = [];

    afterEach(() => {
      for (const id of held) defaultConcurrency.release(id);
      held.length = 0;
    });

    function fillToCapacity() {
      for (let i = 0; i < defaultConcurrency.limit; i++) {
        const id = `filler-${i}`;
        defaultConcurrency.acquire(id);
        held.push(id);
      }
    }

    it("rejects with 429 when the gate is at capacity, without creating a session row", async () => {
      fillToCapacity();

      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: { taskDescription: "Build a notification system" },
      });

      expect(response.statusCode).toBe(429);
      // No DB row for a session that was never admitted.
      expect(sessionService.create).not.toHaveBeenCalled();
      expect(runOrchestrator).not.toHaveBeenCalled();
    });

    it("holds a slot for the whole run and releases it afterward", async () => {
      vi.mocked(sessionService.create).mockResolvedValueOnce(mockParentSession);
      vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
      vi.mocked(sessionService.addEvent).mockResolvedValue({
        id: "event-1",
        sessionId: "parent-session-1",
        type: "orchestrator:start",
        data: {},
        createdAt: "2026-02-27T00:00:00.000Z",
      });

      const before = defaultConcurrency.activeCount();
      let duringRun = -1;

      vi.mocked(runOrchestrator).mockImplementationOnce(async () => {
        // Observed from inside the orchestration: this is the assertion a
        // decorative `canStart()` check cannot satisfy.
        duringRun = defaultConcurrency.activeCount();
        return {
          status: "succeeded" as const,
          childSessionIds: [],
          summary: "Done",
          totalCostUsd: 0.05,
          durationMs: 5000,
        };
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: { taskDescription: "Build a notification system" },
      });

      expect(response.statusCode).toBe(200);
      expect(duringRun).toBe(before + 1);
      expect(defaultConcurrency.activeCount()).toBe(before);
    });

    it("releases the slot when the orchestration throws", async () => {
      vi.mocked(sessionService.create).mockResolvedValueOnce(mockParentSession);
      vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
      vi.mocked(sessionService.addEvent).mockResolvedValue({
        id: "event-1",
        sessionId: "parent-session-1",
        type: "orchestrator:start",
        data: {},
        createdAt: "2026-02-27T00:00:00.000Z",
      });

      const before = defaultConcurrency.activeCount();
      vi.mocked(runOrchestrator).mockRejectedValueOnce(new Error("orchestrator exploded"));

      await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "x-auth-bypass": "true" },
        payload: { taskDescription: "Build a notification system" },
      });

      // A leaked slot is permanent: it would shrink capacity for the process
      // lifetime, which is worse than the unbounded-admission bug being fixed.
      expect(defaultConcurrency.activeCount()).toBe(before);
    });
  });
});
