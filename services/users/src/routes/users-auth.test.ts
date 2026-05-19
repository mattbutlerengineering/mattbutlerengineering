/**
 * Tests for authorization branches in user routes.
 *
 * The existing users.test.ts uses an admin JWT (permissions: ["admin"]) for all
 * requests, so the non-admin code paths (own-profile checks, 401/403 guards)
 * are never exercised. This file covers those branches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { MOCK_JWT_PAYLOAD, makeUser } from "../test/fixtures.js";

vi.mock("../services/user.js", () => ({
  userService: {
    list: vi.fn(),
    getById: vi.fn(),
    getByEmail: vi.fn(),
    create: vi.fn(),
    findOrCreate: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

vi.mock("../services/database.js", () => ({
  prisma: { $queryRaw: vi.fn() },
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

vi.mock("../services/health-checks.js", () => ({
  checkAuth0: vi.fn().mockResolvedValue({ status: "ok", latency: 50 }),
  checkLatencyAnomaly: vi.fn().mockReturnValue({ isAnomaly: false, rollingAvg: 0 }),
  recordDbLatency: vi.fn(),
}));

const nonAdminPayload = {
  ...MOCK_JWT_PAYLOAD,
  permissions: [], // no admin
};

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { userService } from "../services/user.js";
import { jwtVerify } from "jose";
import { buildApp } from "../app.js";

describe("User routes — authorization branches", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.test.com",
    };
    // Default: non-admin user
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: nonAdminPayload,
      protectedHeader: { alg: "RS256" },
    } as never);
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  // ── GET /api/v1/users (list) ─────────────────────────────────────

  describe("GET /api/v1/users — non-admin", () => {
    it("returns 403 when non-admin tries to list users", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Forbidden");
    });
  });

  // ── GET /api/v1/users/:id — non-admin ────────────────────────────

  describe("GET /api/v1/users/:id — non-admin", () => {
    it("allows non-admin to access their own profile", async () => {
      const ownUser = makeUser({ id: "own-user-id", email: "test@example.com" });
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(ownUser);
      vi.mocked(userService.getById).mockResolvedValueOnce(ownUser);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/own-user-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("own-user-id");
    });

    it("returns 403 when non-admin tries to access another user", async () => {
      const ownUser = makeUser({ id: "own-user-id", email: "test@example.com" });
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(ownUser);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/other-user-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when non-admin user not found in database", async () => {
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/some-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns 401 when auth user has no email (get by id)", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { ...nonAdminPayload, email: undefined },
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/some-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ── PATCH /api/v1/users/:id — non-admin ──────────────────────────

  describe("PATCH /api/v1/users/:id — non-admin", () => {
    it("allows non-admin to update their own profile", async () => {
      const ownUser = makeUser({ id: "own-user-id", email: "test@example.com" });
      const updatedUser = makeUser({
        id: "own-user-id",
        email: "test@example.com",
        name: "New Name",
      });
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(ownUser);
      vi.mocked(userService.update).mockResolvedValueOnce(updatedUser);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/own-user-id",
        headers: { authorization: "Bearer valid-token" },
        payload: { name: "New Name" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe("New Name");
    });

    it("returns 403 when non-admin tries to update another user", async () => {
      const ownUser = makeUser({ id: "own-user-id", email: "test@example.com" });
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(ownUser);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/other-user-id",
        headers: { authorization: "Bearer valid-token" },
        payload: { name: "Hacked" },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns 401 when auth user has no email (update)", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { ...nonAdminPayload, email: undefined },
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/some-id",
        headers: { authorization: "Bearer valid-token" },
        payload: { name: "X" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when non-admin user not found in database (update)", async () => {
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/some-id",
        headers: { authorization: "Bearer valid-token" },
        payload: { name: "X" },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ── DELETE /api/v1/users/:id — non-admin ─────────────────────────

  describe("DELETE /api/v1/users/:id — non-admin", () => {
    it("allows non-admin to delete their own profile", async () => {
      const ownUser = makeUser({ id: "own-user-id", email: "test@example.com" });
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(ownUser);
      vi.mocked(userService.delete).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/users/own-user-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 403 when non-admin tries to delete another user", async () => {
      const ownUser = makeUser({ id: "own-user-id", email: "test@example.com" });
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(ownUser);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/users/other-user-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns 401 when auth user has no email (delete)", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { ...nonAdminPayload, email: undefined },
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/users/some-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 404 when deleting a non-existent user", async () => {
      // Admin JWT for this test so we bypass auth checks
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { ...MOCK_JWT_PAYLOAD, permissions: ["admin"] },
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(userService.delete).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/users/nonexistent",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 403 when non-admin user not found in database (delete)", async () => {
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/users/some-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ── GET /api/v1/users/me — edge cases ────────────────────────────

  describe("GET /api/v1/users/me — edge cases", () => {
    it("returns 401 when auth user has no email", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { ...nonAdminPayload, email: undefined },
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/me",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
    });
  });

  // ── PATCH /api/v1/users/me/preferences ───────────────────────────

  describe("PATCH /api/v1/users/me/preferences", () => {
    it("updates preferences for authenticated user", async () => {
      const existingUser = makeUser({ email: "test@example.com" });
      const updatedUser = makeUser({
        email: "test@example.com",
        preferences: { theme: "dark", emailNotifications: true, marketingEmails: false },
      });
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(existingUser);
      vi.mocked(userService.updatePreferences).mockResolvedValueOnce(updatedUser);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/me/preferences",
        headers: { authorization: "Bearer valid-token" },
        payload: { theme: "dark" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.preferences.theme).toBe("dark");
    });

    it("returns 401 when auth user has no email", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { ...nonAdminPayload, email: undefined },
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/me/preferences",
        headers: { authorization: "Bearer valid-token" },
        payload: { theme: "dark" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 404 when user not found", async () => {
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/me/preferences",
        headers: { authorization: "Bearer valid-token" },
        payload: { theme: "dark" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 500 when preferences update fails", async () => {
      const existingUser = makeUser({ email: "test@example.com" });
      vi.mocked(userService.getByEmail).mockResolvedValueOnce(existingUser);
      vi.mocked(userService.updatePreferences).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/me/preferences",
        headers: { authorization: "Bearer valid-token" },
        payload: { theme: "dark" },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Internal Server Error");
    });
  });
});
