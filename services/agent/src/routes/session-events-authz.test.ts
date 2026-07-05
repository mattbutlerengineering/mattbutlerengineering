/**
 * Authorization tests for the session events SSE route.
 *
 * Verifies the GET /v1/sessions/:id/events stream enforces the same
 * owner-or-admin guard as the sibling session routes:
 * - owner            → 200, SSE stream opens
 * - admin            → 200, SSE stream opens (any session)
 * - non-owner        → 404 (existence-hiding, not 403)
 * - null-owner       → admin-only (webhook-origin sessions): admin 200, else 404
 *
 * Uses the @mbe/auth/fastify mock to control request.user directly per test,
 * bypassing JWT verification — the same pattern used in sessions-authz.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AuthUser } from "@mbe/auth/fastify";
import type { AgentSession } from "@mbe/types";

// Control which user is active in each test
let currentUser: AuthUser | undefined;

vi.mock("@mbe/auth/fastify", async (importOriginal) => {
  // Exercise the REAL requireOwnershipOrAdmin + hasPermission (the actual
  // ownership seam); only stub plugin wiring and inject the active user.
  // importOriginal() is typed unknown at this vitest boundary.
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    authPlugin: vi.fn(async () => {}),
    getAuthPluginOptionsFromEnv: vi.fn(() => ({})),
    requireAuth: vi.fn(async (req: { user?: AuthUser }) => {
      req.user = currentUser;
    }),
  };
});

vi.mock("../services/session.js", () => ({
  sessionService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    triggerSession: vi.fn(),
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

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

import { sessionService } from "../services/session.js";
import { buildApp } from "../app.js";

// Helpers to create user fixtures
function makeUser(id: string, permissions: string[] = []): AuthUser {
  return {
    id,
    email: `${id}@example.com`,
    raw: {
      sub: id,
      iss: "https://test.auth0.com/",
      aud: ["https://api.example.com"],
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      permissions,
    },
  };
}

const OWNER_USER = makeUser("auth0|owner-456", []);
const NON_OWNER_USER = makeUser("auth0|stranger-999", []);
const ADMIN_USER = makeUser("auth0|admin-789", ["admin"]);

// Session owned by "auth0|owner-456", terminal so the stream closes on connect.
const ownerSession: AgentSession = {
  id: "session-123",
  status: "succeeded",
  taskDescription: "Fix the login bug",
  userId: "auth0|owner-456",
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

// Webhook-origin session with no owner (admin-only).
const nullOwnerSession: AgentSession = { ...ownerSession, userId: null };

describe("Session Events SSE — Authorization", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    currentUser = OWNER_USER;
    app = await buildApp({ logger: false });
    await app.ready();
    // No persisted events: the terminal session status closes the stream on connect.
    vi.mocked(sessionService.listEvents).mockResolvedValue([]);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("allows the session owner to open the event stream", async () => {
    currentUser = OWNER_USER;
    vi.mocked(sessionService.getById).mockResolvedValueOnce(ownerSession);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-123/events",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
  });

  it("allows an admin to open the event stream for any session", async () => {
    currentUser = ADMIN_USER;
    vi.mocked(sessionService.getById).mockResolvedValueOnce(ownerSession);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-123/events",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
  });

  it("returns 404 for a non-owner non-admin caller", async () => {
    currentUser = NON_OWNER_USER;
    vi.mocked(sessionService.getById).mockResolvedValueOnce(ownerSession);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-123/events",
    });

    // 404 (not 403) to avoid revealing session existence, and no stream opened.
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).not.toContain("text/event-stream");
  });

  it("allows an admin to open the event stream for a null-owner session", async () => {
    currentUser = ADMIN_USER;
    vi.mocked(sessionService.getById).mockResolvedValueOnce(nullOwnerSession);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-123/events",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
  });

  it("returns 404 for a null-owner session when caller is not admin", async () => {
    currentUser = OWNER_USER;
    vi.mocked(sessionService.getById).mockResolvedValueOnce(nullOwnerSession);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-123/events",
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).not.toContain("text/event-stream");
  });
});
