import { describe, it, expect, vi } from "vitest";
import { createPrismaSessionStore } from "./prisma-session-store.js";
import type { sessionService as SessionServiceType } from "./session.js";
import type { AgentSession } from "@mbe/types";

const makeSession = (overrides: Partial<AgentSession> = {}): AgentSession => ({
  id: "s-1",
  status: "pending",
  taskDescription: "task",
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

function fakeService(overrides: Partial<typeof SessionServiceType> = {}) {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    updateStatus: vi.fn(),
    addEvent: vi.fn(),
    ...overrides,
  } as unknown as typeof SessionServiceType;
}

describe("createPrismaSessionStore", () => {
  it("getById projects an AgentSession to a StoredSession", async () => {
    const svc = fakeService({
      getById: vi.fn().mockResolvedValue(makeSession({ status: "running", maxBudgetUsd: 2 })),
    });
    const store = createPrismaSessionStore(svc);

    const stored = await store.getById("s-1");

    expect(stored).toMatchObject({ id: "s-1", status: "running", createPr: true });
  });

  it("derives createPr=false for a zero-budget session", async () => {
    const svc = fakeService({
      getById: vi.fn().mockResolvedValue(makeSession({ maxBudgetUsd: 0 })),
    });
    const store = createPrismaSessionStore(svc);

    expect((await store.getById("s-1"))?.createPr).toBe(false);
  });

  it("getById returns null for an unknown session", async () => {
    const svc = fakeService({ getById: vi.fn().mockResolvedValue(null) });
    expect(await createPrismaSessionStore(svc).getById("missing")).toBeNull();
  });

  it("maps lowercase status to the Prisma uppercase enum", async () => {
    const svc = fakeService({ updateStatus: vi.fn().mockResolvedValue(makeSession()) });
    const store = createPrismaSessionStore(svc);

    await store.updateStatus("s-1", "succeeded", { costUsd: 0.3 });

    expect(svc.updateStatus).toHaveBeenCalledWith("s-1", "SUCCEEDED", { costUsd: 0.3 });
  });

  it("omits the result patch arg on a bare status transition", async () => {
    const svc = fakeService({ updateStatus: vi.fn().mockResolvedValue(makeSession()) });
    const store = createPrismaSessionStore(svc);

    await store.updateStatus("s-1", "running");

    expect(svc.updateStatus).toHaveBeenCalledWith("s-1", "RUNNING");
  });

  it("forwards events to sessionService.addEvent", async () => {
    const svc = fakeService({ addEvent: vi.fn().mockResolvedValue(null) });
    const store = createPrismaSessionStore(svc);

    await store.addEvent("s-1", "session:start", { message: "go" });

    expect(svc.addEvent).toHaveBeenCalledWith("s-1", "session:start", { message: "go" });
  });
});
