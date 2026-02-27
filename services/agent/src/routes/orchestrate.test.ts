import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock all dependencies
vi.mock("../services/session.js", () => ({
  sessionService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    addEvent: vi.fn(),
    listEvents: vi.fn(),
  },
}));

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn().mockReturnValue(0),
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

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
import { buildApp } from "../app.js";

const mockParentSession = {
  id: "parent-session-1",
  status: "pending" as const,
  taskDescription: "[Orchestrator] Build a notification system",
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

      vi.mocked(runOrchestrator).mockResolvedValueOnce({
        status: "succeeded",
        childSessionIds: ["child-1", "child-2"],
        summary: "All tasks completed",
        totalCostUsd: 1.5,
        durationMs: 30000,
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        payload: {
          taskDescription: "Build a notification system",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.parentSessionId).toBe("parent-session-1");
      expect(body.data.status).toBe("succeeded");
      expect(body.data.childSessionIds).toEqual(["child-1", "child-2"]);
      expect(body.data.totalCostUsd).toBe(1.5);
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
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
