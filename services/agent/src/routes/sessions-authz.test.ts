/**
 * Authorization tests for session routes.
 *
 * Verifies owner-or-admin access control:
 * - GET /:id, POST /:id/cancel, DELETE /:id → 404 for non-owner non-admin
 * - GET / → filters to caller's sessions for non-admins; admins see all
 * - Null-owner sessions → admin-only
 *
 * Uses @mbe/auth/fastify mock to control request.user directly per test,
 * bypassing JWT verification — the same pattern used in gen-specs.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AuthUser } from "@mbe/auth/fastify";

// Control which user is active in each test
let currentUser: AuthUser | undefined;

vi.mock("@mbe/auth/fastify", () => ({
  authPlugin: vi.fn(async () => {}),
  getAuthPluginOptionsFromEnv: vi.fn(() => ({})),
  requireAuth: vi.fn(async (req: { user?: AuthUser }) => {
    req.user = currentUser;
  }),
  hasPermission: vi.fn((user: AuthUser | undefined, permission: string) => {
    if (!user) return false;
    const permissions = user.raw?.permissions;
    return Array.isArray(permissions) && (permissions as string[]).includes(permission);
  }),
}));

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
import { cancelSession } from "../services/session-executor.js";
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

// Session owned by "auth0|owner-456"
const ownerSession = {
  id: "session-123",
  status: "pending" as const,
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

// Session with no owner (pre-migration/system session)
const nullOwnerSession = { ...ownerSession, userId: null };

describe("Session Routes — Authorization", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    currentUser = OWNER_USER;
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("GET /v1/sessions/:id — owner-or-admin", () => {
    it("allows the session owner to fetch their session", async () => {
      currentUser = OWNER_USER;
      vi.mocked(sessionService.getById).mockResolvedValueOnce(ownerSession);

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(200);
    });

    it("allows an admin to fetch any session", async () => {
      currentUser = ADMIN_USER;
      vi.mocked(sessionService.getById).mockResolvedValueOnce(ownerSession);

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(200);
    });

    it("returns 404 for a non-owner non-admin caller", async () => {
      currentUser = NON_OWNER_USER;
      vi.mocked(sessionService.getById).mockResolvedValueOnce(ownerSession);

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions/session-123",
      });

      // 404 (not 403) to avoid revealing session existence
      expect(response.statusCode).toBe(404);
    });

    it("returns 404 for a null-owner session when caller is not admin", async () => {
      currentUser = OWNER_USER;
      vi.mocked(sessionService.getById).mockResolvedValueOnce(nullOwnerSession);

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(404);
    });

    it("allows an admin to fetch a null-owner session", async () => {
      currentUser = ADMIN_USER;
      vi.mocked(sessionService.getById).mockResolvedValueOnce(nullOwnerSession);

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /v1/sessions/:id/cancel — owner-or-admin", () => {
    it("allows the session owner to cancel their session", async () => {
      currentUser = OWNER_USER;
      const runningSession = { ...ownerSession, status: "running" as const };
      vi.mocked(sessionService.getById)
        .mockResolvedValueOnce(runningSession)
        .mockResolvedValueOnce({ ...runningSession, status: "cancelled" as const });
      vi.mocked(cancelSession).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions/session-123/cancel",
      });

      expect(response.statusCode).toBe(200);
    });

    it("allows an admin to cancel any session", async () => {
      currentUser = ADMIN_USER;
      const runningSession = { ...ownerSession, status: "running" as const };
      vi.mocked(sessionService.getById)
        .mockResolvedValueOnce(runningSession)
        .mockResolvedValueOnce({ ...runningSession, status: "cancelled" as const });
      vi.mocked(cancelSession).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions/session-123/cancel",
      });

      expect(response.statusCode).toBe(200);
    });

    it("returns 404 for a non-owner non-admin caller", async () => {
      currentUser = NON_OWNER_USER;
      const runningSession = { ...ownerSession, status: "running" as const };
      vi.mocked(sessionService.getById).mockResolvedValueOnce(runningSession);

      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions/session-123/cancel",
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 404 for null-owner session when caller is not admin", async () => {
      currentUser = OWNER_USER;
      const runningSession = { ...nullOwnerSession, status: "running" as const };
      vi.mocked(sessionService.getById).mockResolvedValueOnce(runningSession);

      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions/session-123/cancel",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /v1/sessions/:id — owner-or-admin", () => {
    it("allows the session owner to delete their session", async () => {
      currentUser = OWNER_USER;
      vi.mocked(sessionService.getById).mockResolvedValueOnce(ownerSession);
      vi.mocked(sessionService.delete).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(204);
    });

    it("allows an admin to delete any session", async () => {
      currentUser = ADMIN_USER;
      vi.mocked(sessionService.getById).mockResolvedValueOnce(ownerSession);
      vi.mocked(sessionService.delete).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 404 for a non-owner non-admin caller", async () => {
      currentUser = NON_OWNER_USER;
      vi.mocked(sessionService.getById).mockResolvedValueOnce(ownerSession);

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 404 for null-owner session when caller is not admin", async () => {
      currentUser = OWNER_USER;
      vi.mocked(sessionService.getById).mockResolvedValueOnce(nullOwnerSession);

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/sessions/session-123",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /v1/sessions — list filtering", () => {
    const pagination = {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };

    it("passes userId filter for non-admin callers", async () => {
      currentUser = OWNER_USER;
      vi.mocked(sessionService.list).mockResolvedValueOnce({
        data: [ownerSession],
        pagination,
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions",
      });

      expect(response.statusCode).toBe(200);
      // The service must be called with the caller's userId to filter results
      expect(sessionService.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "auth0|owner-456" })
      );
    });

    it("passes no userId filter for admin callers (admins see all)", async () => {
      currentUser = ADMIN_USER;
      vi.mocked(sessionService.list).mockResolvedValueOnce({
        data: [ownerSession],
        pagination,
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/sessions",
      });

      expect(response.statusCode).toBe(200);
      // Admin: no userId restriction
      expect(sessionService.list).toHaveBeenCalledWith(
        expect.not.objectContaining({ userId: expect.anything() })
      );
    });
  });
});
