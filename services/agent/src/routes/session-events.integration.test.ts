import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

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
    } as never);

    // Mock events
    vi.mocked(prisma.sessionEvent.findMany).mockResolvedValue([
      {
        id: "evt-1",
        sessionId: "session-1",
        type: "session:start",
        data: { message: "Session started" },
        createdAt: new Date(),
      },
    ] as never);

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

  it("event data is valid JSON in SSE format", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-2",
      status: "SUCCEEDED",
      taskDescription: "test",
      branchName: "agent/test",
      baseBranch: "main",
      model: "claude-sonnet-4-6",
      maxTurns: 50,
      maxBudgetUsd: 1,
      prUrl: null,
      prNumber: null,
      resultText: "done",
      costUsd: 0.5,
      inputTokens: 1000,
      outputTokens: 500,
      numTurns: 5,
      durationMs: 30000,
      parentId: null,
      errors: [],
      startedAt: new Date(),
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      sdkSessionId: null,
    } as never);

    vi.mocked(prisma.sessionEvent.findMany).mockResolvedValue([
      {
        id: "evt-1",
        sessionId: "session-2",
        type: "session:start",
        data: { message: "Session started" },
        createdAt: new Date(),
      },
      {
        id: "evt-2",
        sessionId: "session-2",
        type: "session:tool_use",
        data: { toolName: "Read", file_path: "/src/app.ts" },
        createdAt: new Date(),
      },
    ] as never);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-2/events",
      headers: { "x-auth-bypass": "true" },
    });

    const body = response.body;
    // Extract all data lines and verify they're valid JSON
    const dataLines = body
      .split("\n")
      .filter((line: string) => line.startsWith("data: "))
      .map((line: string) => line.slice(6));

    for (const dataLine of dataLines) {
      expect(() => JSON.parse(dataLine)).not.toThrow();
    }
  });
});
