import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildMinimalSuccessFixture } from "@mbe/agent-test-utils";

/**
 * Integration tests for the session events SSE endpoint.
 *
 * Verifies the actual SSE wire format returned by the session events
 * endpoint — content-type headers, event structure, and JSON data lines.
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
    active: 1, idle: 4, busy: 1, size: 5, utilization: 0.2, isDegraded: false,
  }),
}));

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn(),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn(() => 0),
}));

const { prisma } = await import("../services/database.js");
const { buildApp } = await import("../app.js");

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
    // Mock session exists
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

    // Mock events
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

    // Should return SSE content type
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

  it("polls for new events until session completes", async () => {
    vi.useFakeTimers();

    const session = {
      id: "session-3",
      status: "RUNNING", // Not terminal
      taskDescription: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(prisma.session.findUnique)
      .mockResolvedValueOnce(session as unknown as never) // Initial getById
      .mockResolvedValueOnce(session as unknown as never) // First poll getById
      .mockResolvedValueOnce({ ...session, status: "SUCCEEDED" } as unknown as never); // Second poll getById (terminal)

    const initialEvent = { id: "e1", type: "t1", data: {}, createdAt: new Date() };
    const newEvent = { id: "e2", type: "t2", data: {}, createdAt: new Date() };

    vi.mocked(prisma.sessionEvent.findMany)
      .mockResolvedValueOnce([initialEvent] as unknown as never) // Initial listEvents
      .mockResolvedValueOnce([newEvent] as unknown as never) // First poll listEvents
      .mockResolvedValueOnce([] as unknown as never); // Second poll listEvents

    const injectPromise = app.inject({
      method: "GET",
      url: "/v1/sessions/session-3/events",
      headers: { "x-auth-bypass": "true" },
    });

    // Advance timers to trigger polling
    await vi.advanceTimersByTimeAsync(1500); // Trigger first poll
    await vi.advanceTimersByTimeAsync(1500); // Trigger second poll

    const response = await injectPromise;
    const body = response.body;

    expect(body).toContain("event: t1");
    expect(body).toContain("event: t2");
    expect(body).toContain("event: stream:end");
    expect(body).toContain("session_complete");

    vi.useRealTimers();
  });

  it("handles polling errors", async () => {
    vi.useFakeTimers();

    const session = {
      id: "session-5",
      status: "RUNNING",
      taskDescription: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(prisma.session.findUnique)
      .mockResolvedValueOnce(session as unknown as never) // Initial getById
      .mockRejectedValueOnce(new Error("Database failure")); // First poll getById throws

    vi.mocked(prisma.sessionEvent.findMany).mockResolvedValue([] as unknown as never);

    const injectPromise = app.inject({
      method: "GET",
      url: "/v1/sessions/session-5/events",
      headers: { "x-auth-bypass": "true" },
    });

    await vi.advanceTimersByTimeAsync(1500);

    const response = await injectPromise;

    // Stream should contain error event
    expect(response.body).toContain("event: stream:error");
    expect(response.body).toContain("Internal polling error");

    vi.useRealTimers();
  });
});
