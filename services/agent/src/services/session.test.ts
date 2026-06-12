import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    session: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    sessionEvent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "./database.js";
import { sessionService } from "./session.js";

const baseDate = new Date("2026-03-01T12:00:00Z");

const makePrismaSession = (overrides = {}) => ({
  id: "sess-1",
  status: "PENDING" as const,
  taskDescription: "Fix the auth flow",
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
  errors: null,
  sdkSessionId: null,
  createPr: true,
  startedAt: null,
  completedAt: null,
  createdAt: baseDate,
  updatedAt: baseDate,
  failureCategory: null,
  ...overrides,
});

const makePrismaEvent = (overrides = {}) => ({
  id: "evt-1",
  sessionId: "sess-1",
  type: "session:start",
  data: { message: "Started" },
  createdAt: baseDate,
  costUsd: null,
  inputTokens: null,
  outputTokens: null,
  turnIndex: null,
  toolCallId: null,
  toolName: null,
  toolInput: null,
  toolResult: null,
  toolIsError: null,
  thinkingTokens: null,
  modelId: null,
  toolUseId: null,
  toolLatencyMs: null,
  ...overrides,
});

describe("sessionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns paginated sessions with correct pagination metadata", async () => {
      const sessions = [makePrismaSession()];
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce(sessions);
      vi.mocked(prisma.session.count).mockResolvedValueOnce(1);

      const result = await sessionService.list({ page: 1, limit: 10 });

      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: { createdAt: "desc" },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("sess-1");
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it("filters by status when provided", async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.session.count).mockResolvedValueOnce(0);

      await sessionService.list({ page: 1, limit: 10, status: "RUNNING" });

      expect(prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "RUNNING" } })
      );
    });

    it("calculates pagination correctly for multi-page results", async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce([makePrismaSession()]);
      vi.mocked(prisma.session.count).mockResolvedValueOnce(25);

      const result = await sessionService.list({ page: 2, limit: 10 });

      expect(prisma.session.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10 }));
      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      });
    });

    it("maps dates to ISO strings in response", async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce([makePrismaSession()]);
      vi.mocked(prisma.session.count).mockResolvedValueOnce(1);

      const result = await sessionService.list({ page: 1, limit: 10 });

      expect(result.data[0].createdAt).toBe("2026-03-01T12:00:00.000Z");
      expect(result.data[0].updatedAt).toBe("2026-03-01T12:00:00.000Z");
    });

    it("maps status to lowercase", async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce([
        makePrismaSession({ status: "RUNNING" }),
      ]);
      vi.mocked(prisma.session.count).mockResolvedValueOnce(1);

      const result = await sessionService.list({ page: 1, limit: 10 });
      expect(result.data[0].status).toBe("running");
    });

    it("defaults null errors to empty array", async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce([
        makePrismaSession({ errors: null }),
      ]);
      vi.mocked(prisma.session.count).mockResolvedValueOnce(1);

      const result = await sessionService.list({ page: 1, limit: 10 });
      expect(result.data[0].errors).toEqual([]);
    });
  });

  describe("getById", () => {
    it("returns mapped session when found", async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(makePrismaSession());

      const result = await sessionService.getById("sess-1");

      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: "sess-1" },
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBe("sess-1");
      expect(result!.taskDescription).toBe("Fix the auth flow");
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null);

      const result = await sessionService.getById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("creates session with required fields", async () => {
      vi.mocked(prisma.session.create).mockResolvedValueOnce(makePrismaSession());

      const result = await sessionService.create({
        taskDescription: "Fix the auth flow",
      });

      expect(prisma.session.create).toHaveBeenCalledWith({
        data: { taskDescription: "Fix the auth flow" },
      });
      expect(result.id).toBe("sess-1");
    });

    it("passes optional fields when provided", async () => {
      vi.mocked(prisma.session.create).mockResolvedValueOnce(
        makePrismaSession({ model: "claude-opus-4-6", maxTurns: 100 })
      );

      await sessionService.create({
        taskDescription: "Big task",
        model: "claude-opus-4-6",
        maxTurns: 100,
        maxBudgetUsd: 5.0,
        baseBranch: "develop",
        createPr: false,
        parentId: "parent-1",
      });

      expect(prisma.session.create).toHaveBeenCalledWith({
        data: {
          taskDescription: "Big task",
          model: "claude-opus-4-6",
          maxTurns: 100,
          maxBudgetUsd: 5.0,
          baseBranch: "develop",
          createPr: false,
          parentId: "parent-1",
        },
      });
    });

    it("omits undefined optional fields from create data", async () => {
      vi.mocked(prisma.session.create).mockResolvedValueOnce(makePrismaSession());

      await sessionService.create({
        taskDescription: "Simple task",
        model: undefined,
      });

      expect(prisma.session.create).toHaveBeenCalledWith({
        data: { taskDescription: "Simple task" },
      });
    });
  });

  describe("updateStatus", () => {
    it("sets startedAt when status is RUNNING", async () => {
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        makePrismaSession({ status: "RUNNING", startedAt: new Date() })
      );

      const result = await sessionService.updateStatus("sess-1", "RUNNING");

      const callData = vi.mocked(prisma.session.update).mock.calls[0][0].data;
      expect(callData).toHaveProperty("startedAt");
      expect(result).not.toBeNull();
    });

    it("sets completedAt when status is SUCCEEDED", async () => {
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        makePrismaSession({ status: "SUCCEEDED" })
      );

      await sessionService.updateStatus("sess-1", "SUCCEEDED");

      const callData = vi.mocked(prisma.session.update).mock.calls[0][0].data;
      expect(callData).toHaveProperty("completedAt");
    });

    it("sets completedAt when status is FAILED", async () => {
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        makePrismaSession({ status: "FAILED" })
      );

      await sessionService.updateStatus("sess-1", "FAILED");

      const callData = vi.mocked(prisma.session.update).mock.calls[0][0].data;
      expect(callData).toHaveProperty("completedAt");
    });

    it("sets completedAt when status is CANCELLED", async () => {
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        makePrismaSession({ status: "CANCELLED" })
      );

      await sessionService.updateStatus("sess-1", "CANCELLED");

      const callData = vi.mocked(prisma.session.update).mock.calls[0][0].data;
      expect(callData).toHaveProperty("completedAt");
    });

    it("passes result fields when provided", async () => {
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        makePrismaSession({ status: "SUCCEEDED" })
      );

      await sessionService.updateStatus("sess-1", "SUCCEEDED", {
        branchName: "agent/fix-auth",
        prUrl: "https://github.com/org/repo/pull/42",
        prNumber: 42,
        resultText: "Fixed the auth",
        costUsd: 0.5,
        inputTokens: 1000,
        outputTokens: 2000,
        numTurns: 5,
        durationMs: 30000,
        errors: ["warning"],
        sdkSessionId: "sdk-123",
      });

      const callData = vi.mocked(prisma.session.update).mock.calls[0][0].data;
      expect(callData).toMatchObject({
        status: "SUCCEEDED",
        branchName: "agent/fix-auth",
        prUrl: "https://github.com/org/repo/pull/42",
        prNumber: 42,
        resultText: "Fixed the auth",
        costUsd: 0.5,
        inputTokens: 1000,
        outputTokens: 2000,
        numTurns: 5,
        durationMs: 30000,
        errors: ["warning"],
        sdkSessionId: "sdk-123",
      });
    });

    it("returns null when session not found (P2025 error)", async () => {
      const prismaError = new Error("Not found");
      Object.assign(prismaError, { code: "P2025" });
      vi.mocked(prisma.session.update).mockRejectedValueOnce(prismaError);

      const result = await sessionService.updateStatus("nonexistent", "FAILED");
      expect(result).toBeNull();
    });

    it("rethrows non-P2025 errors", async () => {
      vi.mocked(prisma.session.update).mockRejectedValueOnce(new Error("Connection lost"));

      await expect(sessionService.updateStatus("sess-1", "FAILED")).rejects.toThrow(
        "Connection lost"
      );
    });

    it("does not set startedAt for PENDING status", async () => {
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        makePrismaSession({ status: "PENDING" })
      );

      await sessionService.updateStatus("sess-1", "PENDING");

      const callData = vi.mocked(prisma.session.update).mock.calls[0][0].data;
      expect(callData).not.toHaveProperty("startedAt");
      expect(callData).not.toHaveProperty("completedAt");
    });
  });

  describe("delete", () => {
    it("returns true when session is deleted", async () => {
      vi.mocked(prisma.session.delete).mockResolvedValueOnce(makePrismaSession());

      const result = await sessionService.delete("sess-1");
      expect(result).toBe(true);
    });

    it("returns false when session not found", async () => {
      const prismaError = new Error("Not found");
      Object.assign(prismaError, { code: "P2025" });
      vi.mocked(prisma.session.delete).mockRejectedValueOnce(prismaError);

      const result = await sessionService.delete("nonexistent");
      expect(result).toBe(false);
    });

    it("rethrows non-P2025 errors", async () => {
      vi.mocked(prisma.session.delete).mockRejectedValueOnce(new Error("DB error"));

      await expect(sessionService.delete("sess-1")).rejects.toThrow("DB error");
    });
  });

  describe("findByStatus", () => {
    it("returns sessions matching the given status", async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce([
        makePrismaSession({ status: "RUNNING" }),
      ]);

      const result = await sessionService.findByStatus("RUNNING");

      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { status: "RUNNING" },
        orderBy: { updatedAt: "asc" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("running");
    });
  });

  describe("getLastEvent", () => {
    it("returns the most recent event for a session", async () => {
      vi.mocked(prisma.sessionEvent.findFirst).mockResolvedValueOnce(makePrismaEvent());

      const result = await sessionService.getLastEvent("sess-1");

      expect(prisma.sessionEvent.findFirst).toHaveBeenCalledWith({
        where: { sessionId: "sess-1" },
        orderBy: { createdAt: "desc" },
      });
      expect(result).not.toBeNull();
      expect(result!.type).toBe("session:start");
    });

    it("returns null when no events exist", async () => {
      vi.mocked(prisma.sessionEvent.findFirst).mockResolvedValueOnce(null);

      const result = await sessionService.getLastEvent("sess-1");
      expect(result).toBeNull();
    });

    it("maps event data with null fallback to empty object", async () => {
      vi.mocked(prisma.sessionEvent.findFirst).mockResolvedValueOnce(
        makePrismaEvent({ data: null })
      );

      const result = await sessionService.getLastEvent("sess-1");
      expect(result!.data).toEqual({});
    });
  });

  describe("addEvent", () => {
    it("creates an event with the given type and data", async () => {
      vi.mocked(prisma.sessionEvent.create).mockResolvedValueOnce(makePrismaEvent());

      const result = await sessionService.addEvent("sess-1", "session:start", {
        message: "Started",
      });

      expect(prisma.sessionEvent.create).toHaveBeenCalledWith({
        data: {
          sessionId: "sess-1",
          type: "session:start",
          data: { message: "Started" },
        },
      });
      expect(result.sessionId).toBe("sess-1");
    });

    it("defaults data to empty object when not provided", async () => {
      vi.mocked(prisma.sessionEvent.create).mockResolvedValueOnce(makePrismaEvent({ data: {} }));

      await sessionService.addEvent("sess-1", "session:start");

      expect(prisma.sessionEvent.create).toHaveBeenCalledWith({
        data: {
          sessionId: "sess-1",
          type: "session:start",
          data: {},
        },
      });
    });
  });

  describe("listEvents", () => {
    it("returns events for a session ordered by createdAt asc", async () => {
      vi.mocked(prisma.sessionEvent.findMany).mockResolvedValueOnce([makePrismaEvent()]);

      const result = await sessionService.listEvents("sess-1");

      expect(prisma.sessionEvent.findMany).toHaveBeenCalledWith({
        where: { sessionId: "sess-1" },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      expect(result).toHaveLength(1);
    });

    it("filters events after a cursor when afterId is provided", async () => {
      const cursorDate = new Date("2026-03-01T12:05:00Z");
      vi.mocked(prisma.sessionEvent.findUnique).mockResolvedValueOnce({
        createdAt: cursorDate,
      } as never);
      vi.mocked(prisma.sessionEvent.findMany).mockResolvedValueOnce([]);

      await sessionService.listEvents("sess-1", "evt-cursor");

      expect(prisma.sessionEvent.findUnique).toHaveBeenCalledWith({
        where: { id: "evt-cursor" },
        select: { createdAt: true },
      });
      expect(prisma.sessionEvent.findMany).toHaveBeenCalledWith({
        where: { sessionId: "sess-1", createdAt: { gt: cursorDate } },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
    });

    it("does not filter by createdAt when cursor event not found", async () => {
      vi.mocked(prisma.sessionEvent.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.sessionEvent.findMany).mockResolvedValueOnce([]);

      await sessionService.listEvents("sess-1", "bad-cursor");

      expect(prisma.sessionEvent.findMany).toHaveBeenCalledWith({
        where: { sessionId: "sess-1" },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
    });

    it("maps event dates to ISO strings", async () => {
      vi.mocked(prisma.sessionEvent.findMany).mockResolvedValueOnce([makePrismaEvent()]);

      const result = await sessionService.listEvents("sess-1");
      expect(result[0].createdAt).toBe("2026-03-01T12:00:00.000Z");
    });
  });

  describe("findStaleSessions", () => {
    it("returns session IDs with no events older than threshold", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ id: "sess-stale" }]);

      const result = await sessionService.findStaleSessions(600_000);

      expect(result).toEqual(["sess-stale"]);
    });

    it("returns session IDs where latest event is older than threshold", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ id: "sess-old-event" }]);

      const result = await sessionService.findStaleSessions(600_000);

      expect(result).toEqual(["sess-old-event"]);
    });

    it("does NOT return sessions with recent events", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);

      const result = await sessionService.findStaleSessions(600_000);

      expect(result).toHaveLength(0);
    });

    it("does NOT return non-RUNNING sessions", async () => {
      // The query itself filters to RUNNING only, so no rows returned
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);

      const result = await sessionService.findStaleSessions(600_000);

      expect(result).toHaveLength(0);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it("uses updatedAt as fallback when no events exist", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ id: "sess-no-events" }]);

      const result = await sessionService.findStaleSessions(600_000);

      expect(result).toEqual(["sess-no-events"]);
    });

    it("passes the threshold as interval to the query", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);

      await sessionService.findStaleSessions(300_000);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
