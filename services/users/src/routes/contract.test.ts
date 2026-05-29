import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { UserSchema } from "@mbe/types";

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
  prisma: {
    $queryRaw: vi.fn(),
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

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { userService } from "../services/user.js";
import { jwtVerify } from "jose";
import { buildApp } from "../app.js";

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  emailVerified: true,
  preferences: {
    theme: "light" as const,
    emailNotifications: true,
    marketingEmails: false,
  },
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

const mockUserPayload = {
  sub: "auth0|user-123",
  email: "test@example.com",
  email_verified: true,
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  permissions: ["admin"],
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

describe("User Service API Contract", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH0_DOMAIN: "test.auth0.com",
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockUserPayload,
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

  describe("GET /api/v1/users/:id", () => {
    it("returns user and matches UserSchema", async () => {
      vi.mocked(userService.getById).mockResolvedValueOnce(mockUser);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/user-123",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const result = UserSchema.safeParse(body.data);
      expect(result.success).toBe(true);
    });

    it("returns 404 when user not found", async () => {
      vi.mocked(userService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/non-existent",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("GET /api/v1/users", () => {
    it("returns paginated users list", async () => {
      vi.mocked(userService.list).mockResolvedValueOnce({
        data: [mockUser],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.pagination).toBeDefined();
    });
  });

  describe("POST /api/v1/users", () => {
    it("creates user and returns created user", async () => {
      vi.mocked(userService.create).mockResolvedValueOnce(mockUser);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        headers: { authorization: "Bearer valid-token" },
        payload: { email: "new@example.com", name: "New User" },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      const result = UserSchema.safeParse(body.data);
      expect(result.success).toBe(true);
    });

    it("returns 401 without auth", async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("No token"));

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        payload: { email: "new@example.com" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/users/me", () => {
    it("returns 401 without auth", async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("No token"));

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/me",
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
