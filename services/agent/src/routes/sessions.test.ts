import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock all service dependencies
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

import { sessionService } from "../services/session.js";
import { cancelSession, getActiveSessionCount } from "../services/session-executor.js";
import { buildApp } from "../app.js";

const mockSession = {
  id: "session-123",
  status: "pending" as const,
  taskDescription: "Fix the login bug",
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
  createdAt: "2026-02-27T00:00:00.000Z",
  updatedAt: "2026-02-27T00:00:00.000Z",
};

describe("Session Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("POST /v1/sessions", () => {
    it("creates a session and returns 201", async () => {
      vi.mocked(sessionService.create).mockResolvedValueOnce(mockSession);

      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions",
        payload: { taskDescription: "Fix the login bug" },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("session-123");
      expect(body.data.taskDescription).toBe("Fix the login bug");
    });

    it("returns 429 when max concurrent sessions reached", async () => {
      vi.mocked(getActiveSessionCount).mockReturnValueOnce(5);

      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions",
        payload: { taskDescription: "Another task" },
      });

      expect(response.statusCode).toBe(429);
    });
  });

  describe("GET /v1/sessions", () => {
    it("returns paginated list of sessions", async () => {
      vi.mocked(sessionService.list).mockResolvedValueOnce({
        data: [mockSession],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.pagination.total).toBe(1);
    });
  });

  describe("GET /v1/sessions/:id", () => {
    it("returns session by ID", async () => {
      vi.mocked(sessionService.getById).mockResolvedValueOnce(mockSession);

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("session-123");
    });

    it("returns 404 for unknown session", async () => {
      vi.mocked(sessionService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions/nonexistent",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/sessions/:id/cancel", () => {
    it("cancels a running session", async () => {
      const runningSession = { ...mockSession, status: "running" as const };
      vi.mocked(sessionService.getById)
        .mockResolvedValueOnce(runningSession)
        .mockResolvedValueOnce({ ...runningSession, status: "cancelled" as const });
      vi.mocked(cancelSession).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions/session-123/cancel",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("cancelled");
    });

    it("returns 409 for non-running session", async () => {
      vi.mocked(sessionService.getById).mockResolvedValueOnce(mockSession);

      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions/session-123/cancel",
      });

      expect(response.statusCode).toBe(409);
    });

    it("returns 404 for unknown session", async () => {
      vi.mocked(sessionService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions/nonexistent/cancel",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /v1/sessions/:id", () => {
    it("deletes a session and returns 204", async () => {
      vi.mocked(sessionService.delete).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 404 for unknown session", async () => {
      vi.mocked(sessionService.delete).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/sessions/nonexistent",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
