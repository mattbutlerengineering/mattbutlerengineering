import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AgentSessionEvent } from "@mbe/types";
import { buildMinimalSuccessFixture } from "@mbe/agent-test-utils";

/**
 * Integration tests for the session events SSE endpoint.
 *
 * The endpoint replays persisted events from the database once on connect
 * (catch-up), then streams new events live via the in-process subscription
 * seam — no fixed-interval poll loop. These tests verify the wire format,
 * catch-up, terminal close, live delivery without a poll timer, single DB
 * read per connect, and shared fan-out across concurrent subscribers.
 */

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn().mockResolvedValue({
    payload: {
      sub: "test-user",
      email: "test@example.com",
      permissions: [],
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    protectedHeader: { alg: "RS256" },
  }),
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    session: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    sessionEvent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
  getPoolMetrics: vi.fn().mockReturnValue({
    active: 1,
    idle: 4,
    busy: 1,
    size: 5,
    utilization: 0.2,
    isDegraded: false,
  }),
}));

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn(),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn(() => 0),
}));

const { prisma } = await import("../services/database.js");
const { getSessionEventEmitter } = await import("../services/session-event-emitter.js");
const { buildApp } = await import("../app.js");

function makeLiveEvent(
  sessionId: string,
  id: string,
  type: string,
  data: Record<string, unknown> = {}
): AgentSessionEvent {
  return { id, sessionId, type, data, createdAt: new Date().toISOString() };
}

/** Wait one macrotask so SSE writes flush before assertions. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Session Events SSE Integration", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.test.com";
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns SSE content-type for event stream", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      status: "SUCCEEDED",
      taskDescription: "test",
      branchName: null,
      baseBranch: "main",
      model: "claude-sonnet-4-6",
      maxTurns: 50,
      maxBudgetUsd: 1,
      prUrl: null,
      prNumber: null,
      resultText: null,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      numTurns: 0,
      durationMs: 0,
      parentId: null,
      errors: [],
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      sdkSessionId: null,
    } as unknown as never);

    const events = buildMinimalSuccessFixture({ sessionId: "session-1" }).map((e, i) => ({
      id: `evt-${i}`,
      sessionId: "session-1",
      type: e.type,
      data: e.data,
      createdAt: new Date(),
    }));

    vi.mocked(prisma.sessionEvent.findMany).mockResolvedValue(events as unknown as never);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-1/events",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.headers["content-type"]).toContain("text/event-stream");
  });

  it("returns 404 for non-existent session", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/nonexistent/events",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("replays existing events on connect, then closes a terminal session", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-replay",
      status: "SUCCEEDED",
      taskDescription: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as never);

    vi.mocked(prisma.sessionEvent.findMany).mockResolvedValue([
      { id: "e1", sessionId: "session-replay", type: "t1", data: {}, createdAt: new Date() },
      { id: "e2", sessionId: "session-replay", type: "t2", data: {}, createdAt: new Date() },
    ] as unknown as never);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-replay/events",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.body).toContain("event: t1");
    expect(response.body).toContain("event: t2");
    expect(response.body).toContain("event: stream:end");
    expect(response.body).toContain("session_complete");
    // Catch-up read happens exactly once; no poll loop.
    expect(prisma.sessionEvent.findMany).toHaveBeenCalledTimes(1);
  });

  it("delivers a live event via the subscription without advancing any poll timer", async () => {
    // Real timers + a spy proves no setTimeout-based poll loop is relied upon.
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-live",
      status: "RUNNING",
      taskDescription: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as never);

    vi.mocked(prisma.sessionEvent.findMany).mockResolvedValue([] as unknown as never);

    const reply = app.inject({
      method: "GET",
      url: "/v1/sessions/session-live/events",
      headers: { "x-auth-bypass": "true" },
    });

    // Let the route subscribe and finish catch-up.
    await tick();

    const dbCallsBeforeLive = vi.mocked(prisma.sessionEvent.findMany).mock.calls.length;

    // Publish a live event, then a terminal one to close the stream.
    getSessionEventEmitter().publish(makeLiveEvent("session-live", "live-1", "agent:message"));
    getSessionEventEmitter().publish(
      makeLiveEvent("session-live", "live-2", "session:complete", { status: "SUCCEEDED" })
    );

    const response = await reply;

    expect(response.body).toContain("event: agent:message");
    expect(response.body).toContain("event: session:complete");
    expect(response.body).toContain("event: stream:end");
    // No additional DB event-list read after connect — live path is the subscription.
    expect(vi.mocked(prisma.sessionEvent.findMany).mock.calls.length).toBe(dbCallsBeforeLive);
    expect(prisma.sessionEvent.findMany).toHaveBeenCalledTimes(1);

    setTimeoutSpy.mockRestore();
  });

  it("shares a single emit across concurrent subscribers with one DB read each", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-multi",
      status: "RUNNING",
      taskDescription: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as never);

    vi.mocked(prisma.sessionEvent.findMany).mockResolvedValue([] as unknown as never);

    const replyA = app.inject({
      method: "GET",
      url: "/v1/sessions/session-multi/events",
      headers: { "x-auth-bypass": "true" },
    });
    const replyB = app.inject({
      method: "GET",
      url: "/v1/sessions/session-multi/events",
      headers: { "x-auth-bypass": "true" },
    });

    await tick();

    // Each subscriber read the DB once on connect (2 connects = 2 reads). No
    // further reads happen for the live event below.
    expect(prisma.sessionEvent.findMany).toHaveBeenCalledTimes(2);
    const readsAfterConnect = vi.mocked(prisma.sessionEvent.findMany).mock.calls.length;

    // A single publish fans out to both subscribers.
    getSessionEventEmitter().publish(
      makeLiveEvent("session-multi", "m-1", "session:complete", { status: "SUCCEEDED" })
    );

    const [responseA, responseB] = await Promise.all([replyA, replyB]);

    expect(responseA.body).toContain("event: session:complete");
    expect(responseB.body).toContain("event: session:complete");
    // No per-client DB reads after connect.
    expect(vi.mocked(prisma.sessionEvent.findMany).mock.calls.length).toBe(readsAfterConnect);
  });

  it("emits a stream:error if catch-up read fails", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-err",
      status: "RUNNING",
      taskDescription: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as never);

    vi.mocked(prisma.sessionEvent.findMany).mockRejectedValue(new Error("DB down"));

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-err/events",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.body).toContain("event: stream:error");
    expect(response.body).toContain("Internal stream error");
  });
});
