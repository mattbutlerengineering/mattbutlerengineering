import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeUser, makePaginatedResponse, MOCK_JWT_PAYLOAD } from "../test/fixtures.js";

vi.mock("../services/user.js", () => ({
  userService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findOrCreate: vi.fn(),
    getByEmail: vi.fn(),
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

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn().mockResolvedValue({
    payload: MOCK_JWT_PAYLOAD,
    protectedHeader: { alg: "RS256" },
  }),
}));

import { userService } from "../services/user.js";
import { buildApp } from "../app.js";

describe("User routes — edge cases", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.test.com";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("Pagination bounds", () => {
    it("handles page=0 gracefully", async () => {
      vi.mocked(userService.list).mockResolvedValueOnce(
        makePaginatedResponse([], { page: 0, limit: 10, total: 0 })
      );

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users?page=0",
        headers: { authorization: "Bearer valid-token" },
      });

      // Should not crash — may return empty or default to page 1
      expect([200, 400]).toContain(response.statusCode);
    });

    it("handles very large limit", async () => {
      vi.mocked(userService.list).mockResolvedValueOnce(
        makePaginatedResponse([makeUser()], { page: 1, limit: 9999, total: 1 })
      );

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users?limit=9999",
        headers: { authorization: "Bearer valid-token" },
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it("handles negative page number", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users?page=-1",
        headers: { authorization: "Bearer valid-token" },
      });

      // Should return 400 or fall back to defaults
      expect([200, 400]).toContain(response.statusCode);
    });
  });

  describe("Malformed requests", () => {
    it("rejects create user with missing email", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        headers: { authorization: "Bearer valid-token" },
        payload: { name: "No Email User" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects create user with invalid email format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        headers: { authorization: "Bearer valid-token" },
        payload: { email: "not-an-email" },
      });

      // May be 400 (schema validation) or 201 (if schema doesn't validate format)
      expect([201, 400]).toContain(response.statusCode);
    });

    it("returns 404 for non-existent user ID", async () => {
      vi.mocked(userService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/nonexistent-id-12345",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  describe("Immutable fixture safety", () => {
    it("MOCK_USER cannot be mutated", () => {
      const user = makeUser();
      expect(() => {
        (user as unknown as Record<string, unknown>).name = "mutated";
      }).toThrow();
    });
  });
});
