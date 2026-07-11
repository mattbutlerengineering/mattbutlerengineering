import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    sessionEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("./session-event-emitter.js", () => {
  const publish = vi.fn();
  return {
    getSessionEventEmitter: () => ({ publish, subscribe: vi.fn() }),
    setSessionEventEmitter: vi.fn(),
  };
});

import { prisma } from "./database.js";
import { getSessionEventEmitter } from "./session-event-emitter.js";
import { sessionLifecycleStore } from "./session-lifecycle-store.js";

const baseDate = new Date("2026-03-01T12:00:00Z");

const makePrismaSession = (overrides = {}) => ({
  id: "s-1",
  status: "PENDING" as const,
  taskDescription: "task",
  userId: null,
  branchName: null,
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 50,
  maxBudgetUsd: 1.0,
  createPr: true,
  prUrl: null,
  prNumber: null,
  resultText: null,
  costUsd: null,
  inputTokens: null,
  outputTokens: null,
  numTurns: null,
  durationMs: null,
  errors: null,
  failureCategory: null,
  sdkSessionId: null,
  startedAt: null,
  completedAt: null,
  createdAt: baseDate,
  updatedAt: baseDate,
  parentId: null,
  ...overrides,
});

describe("sessionLifecycleStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getById", () => {
    it("projects a Prisma row to a StoredSession with a lowercase status", async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(
        makePrismaSession({ status: "RUNNING", maxBudgetUsd: 2 })
      );

      const stored = await sessionLifecycleStore.getById("s-1");

      expect(prisma.session.findUnique).toHaveBeenCalledWith({ where: { id: "s-1" } });
      expect(stored).toMatchObject({ id: "s-1", status: "running", maxBudgetUsd: 2 });
    });

    it("honors persisted createPr=false despite a positive budget (no PR path)", async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(
        makePrismaSession({ createPr: false, maxBudgetUsd: 2 })
      );

      expect((await sessionLifecycleStore.getById("s-1"))?.createPr).toBe(false);
    });

    it("honors persisted createPr=true despite a zero budget", async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(
        makePrismaSession({ createPr: true, maxBudgetUsd: 0 })
      );

      expect((await sessionLifecycleStore.getById("s-1"))?.createPr).toBe(true);
    });

    it("returns null for an unknown session", async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null);

      expect(await sessionLifecycleStore.getById("missing")).toBeNull();
    });

    it("defaults null errors to an empty array", async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(
        makePrismaSession({ errors: null })
      );

      expect((await sessionLifecycleStore.getById("s-1"))?.errors).toEqual([]);
    });
  });

  describe("create", () => {
    it("persists the caller's createPr verbatim", async () => {
      vi.mocked(prisma.session.create).mockResolvedValueOnce(
        makePrismaSession({ createPr: false })
      );

      const stored = await sessionLifecycleStore.create({
        taskDescription: "task",
        createPr: false,
        maxBudgetUsd: 5,
      });

      expect(prisma.session.create).toHaveBeenCalledWith({
        data: { taskDescription: "task", createPr: false, maxBudgetUsd: 5 },
      });
      expect(stored.createPr).toBe(false);
    });

    it("omits undefined optionals so schema defaults apply", async () => {
      vi.mocked(prisma.session.create).mockResolvedValueOnce(makePrismaSession());

      await sessionLifecycleStore.create({ taskDescription: "task" });

      expect(prisma.session.create).toHaveBeenCalledWith({
        data: { taskDescription: "task" },
      });
    });

    it("passes userId and parentId only when non-null", async () => {
      vi.mocked(prisma.session.create).mockResolvedValueOnce(makePrismaSession());

      await sessionLifecycleStore.create({
        taskDescription: "task",
        userId: null,
        parentId: "parent-1",
      });

      expect(prisma.session.create).toHaveBeenCalledWith({
        data: { taskDescription: "task", parentId: "parent-1" },
      });
    });
  });

  describe("updateStatus", () => {
    it("maps the lowercase status to the Prisma uppercase enum", async () => {
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        makePrismaSession({ status: "SUCCEEDED" })
      );

      const stored = await sessionLifecycleStore.updateStatus("s-1", "succeeded", {
        costUsd: 0.3,
      });

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: "s-1" },
        data: expect.objectContaining({ status: "SUCCEEDED", costUsd: 0.3 }),
      });
      expect(stored?.status).toBe("succeeded");
    });

    it("stamps startedAt on the running transition", async () => {
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        makePrismaSession({ status: "RUNNING" })
      );

      await sessionLifecycleStore.updateStatus("s-1", "running");

      const callData = vi.mocked(prisma.session.update).mock.calls[0][0].data;
      expect(callData).toHaveProperty("startedAt");
      expect(callData).not.toHaveProperty("completedAt");
    });

    it("stamps completedAt on terminal transitions", async () => {
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        makePrismaSession({ status: "FAILED" })
      );

      await sessionLifecycleStore.updateStatus("s-1", "failed", { errors: ["boom"] });

      const callData = vi.mocked(prisma.session.update).mock.calls[0][0].data;
      expect(callData).toHaveProperty("completedAt");
      expect(callData).toMatchObject({ errors: ["boom"] });
    });

    it("translates opts.fromStatus to the uppercase enum in a CAS updateMany", async () => {
      vi.mocked(prisma.session.updateMany).mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(
        makePrismaSession({ status: "CANCELLED" })
      );

      const stored = await sessionLifecycleStore.updateStatus(
        "s-1",
        "cancelled",
        { errors: ["Cancelled by user"] },
        { fromStatus: ["running"] }
      );

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: "s-1", status: { in: ["RUNNING"] } },
        data: expect.objectContaining({ status: "CANCELLED" }),
      });
      expect(stored?.status).toBe("cancelled");
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it("returns null when the CAS loses the race (0-row update)", async () => {
      vi.mocked(prisma.session.updateMany).mockResolvedValueOnce({ count: 0 });

      const stored = await sessionLifecycleStore.updateStatus(
        "s-1",
        "cancelled",
        { errors: ["Cancelled by user"] },
        { fromStatus: ["running"] }
      );

      expect(stored).toBeNull();
      expect(prisma.session.findUnique).not.toHaveBeenCalled();
    });

    it("returns null when the session does not exist (P2025)", async () => {
      const prismaError = new Error("Not found");
      Object.assign(prismaError, { code: "P2025" });
      vi.mocked(prisma.session.update).mockRejectedValueOnce(prismaError);

      expect(await sessionLifecycleStore.updateStatus("missing", "failed")).toBeNull();
    });

    it("rethrows non-P2025 errors", async () => {
      vi.mocked(prisma.session.update).mockRejectedValueOnce(new Error("Connection lost"));

      await expect(sessionLifecycleStore.updateStatus("s-1", "failed")).rejects.toThrow(
        "Connection lost"
      );
    });
  });

  describe("addEvent", () => {
    it("persists the event and publishes it on the SSE seam", async () => {
      vi.mocked(prisma.sessionEvent.create).mockResolvedValueOnce({
        id: "evt-1",
        sessionId: "s-1",
        type: "session:start",
        data: { message: "go" },
        createdAt: baseDate,
        turnIndex: null,
        inputTokens: null,
        outputTokens: null,
        thinkingTokens: null,
        costUsd: null,
        modelId: null,
        toolName: null,
        toolUseId: null,
        toolLatencyMs: null,
      } as never);

      await sessionLifecycleStore.addEvent("s-1", "session:start", { message: "go" });

      expect(prisma.sessionEvent.create).toHaveBeenCalledWith({
        data: { sessionId: "s-1", type: "session:start", data: { message: "go" } },
      });
      expect(getSessionEventEmitter().publish).toHaveBeenCalledWith({
        id: "evt-1",
        sessionId: "s-1",
        type: "session:start",
        data: { message: "go" },
        createdAt: "2026-03-01T12:00:00.000Z",
      });
    });
  });
});
