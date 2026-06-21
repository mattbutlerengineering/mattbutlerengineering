import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the user service
vi.mock("../services/user.js", () => ({
  userService: {
    list: vi.fn(),
    getById: vi.fn(),
    getByEmail: vi.fn(),
    create: vi.fn(),
    findOrCreate: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the database (needed for health check registration)
vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// Mock jose library for JWT verification
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { userService } from "../services/user.js";
import { jwtVerify } from "jose";

const mockJWTPayload = {
  sub: "auth0|user-123",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: "test@example.com",
  email_verified: true,
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  permissions: ["admin"],
};

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  emailVerified: true,
  preferences: {},
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

describe("User Routes", () => {
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
      payload: mockJWTPayload,
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

  describe("GET /api/v1/users", () => {
    it("returns 401 without auth token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns paginated list of users", async () => {
      vi.mocked(userService.list).mockResolvedValueOnce({
        data: [mockUser],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].email).toBe("test@example.com");
      expect(body.pagination.total).toBe(1);
    });

    it("respects page and limit query params", async () => {
      vi.mocked(userService.list).mockResolvedValueOnce({
        data: [],
        pagination: {
          page: 2,
          limit: 5,
          total: 10,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        },
      });

      await app.inject({
        method: "GET",
        url: "/api/v1/users?page=2&limit=5",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(userService.list).toHaveBeenCalledWith(2, 5);
    });
  });

  describe("GET /api/v1/users/:id", () => {
    it("returns user by ID", async () => {
      vi.mocked(userService.getById).mockResolvedValueOnce(mockUser);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/user-123",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("user-123");
      expect(body.data.email).toBe("test@example.com");
    });

    it("returns 404 when user not found", async () => {
      vi.mocked(userService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/nonexistent",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Not Found");
    });
  });

  describe("POST /api/v1/users", () => {
    it("creates a new user", async () => {
      vi.mocked(userService.create).mockResolvedValueOnce(mockUser);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        headers: { authorization: "Bearer valid-token" },
        payload: {
          email: "test@example.com",
          name: "Test User",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.email).toBe("test@example.com");
    });

    it("creates user with email only", async () => {
      const userWithoutName = { ...mockUser, name: null };
      vi.mocked(userService.create).mockResolvedValueOnce(userWithoutName);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        headers: { authorization: "Bearer valid-token" },
        payload: {
          email: "minimal@example.com",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(userService.create).toHaveBeenCalledWith({
        email: "minimal@example.com",
      });
    });
  });

  describe("PATCH /api/v1/users/:id", () => {
    it("returns 401 when JWT has no email (resolveCurrentUserId returns null)", async () => {
      // Covers OptionalChaining mutant on `request.user?.email` (line 18) and
      // ConditionalExpression mutant on `if (!email) return null` (line 19).
      //
      // When email is absent, resolveCurrentUserId should return null early
      // WITHOUT calling getByEmail. If the `if (!email) return null` guard is
      // mutated to `if (false) return null`, the function calls getByEmail(undefined)
      // instead. We mock getByEmail to return a real user to make the two code
      // paths observably different: real code → null → 401; mutant → user found
      // → non-null currentId → 403 (different user id than target "user-123").
      // Note: permissions must NOT include "admin" — admins bypass identity check.
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { ...mockJWTPayload, email: undefined, permissions: [] },
        protectedHeader: { alg: "RS256" },
      } as never);
      // Return a user from getByEmail so mutant path (false-guard) produces a
      // non-null currentId — differentiating it from the real code path (401).
      vi.mocked(userService.getByEmail).mockResolvedValue({ ...mockUser, id: "different-id" });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/user-123",
        headers: { authorization: "Bearer valid-token" },
        payload: { name: "New Name" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("updates user", async () => {
      const updatedUser = { ...mockUser, name: "Updated Name" };
      vi.mocked(userService.update).mockResolvedValueOnce(updatedUser);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/user-123",
        headers: { authorization: "Bearer valid-token" },
        payload: {
          name: "Updated Name",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe("Updated Name");
    });

    it("returns 404 when updating nonexistent user", async () => {
      vi.mocked(userService.update).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/nonexistent",
        headers: { authorization: "Bearer valid-token" },
        payload: {
          name: "New Name",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/users/:id", () => {
    it("deletes user and returns 204", async () => {
      vi.mocked(userService.delete).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/users/user-123",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(204);
      expect(userService.delete).toHaveBeenCalledWith("user-123");
    });
  });
});

describe("GET /api/v1/users/me", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH0_DOMAIN: "test.auth0.com",
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  it("returns user data for valid token with existing user", async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: mockJWTPayload,
      protectedHeader: { alg: "RS256" },
    } as never);

    vi.mocked(userService.findOrCreate).mockResolvedValueOnce(mockUser);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: {
        authorization: "Bearer valid-token",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.email).toBe("test@example.com");
    expect(userService.findOrCreate).toHaveBeenCalledWith({
      email: "test@example.com",
      name: "Test User",
      picture: "https://example.com/pic.jpg",
    });
  });

  it("creates user and returns data for valid token with new user", async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: mockJWTPayload,
      protectedHeader: { alg: "RS256" },
    } as never);

    vi.mocked(userService.findOrCreate).mockResolvedValueOnce(mockUser);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: {
        authorization: "Bearer valid-token",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.email).toBe("test@example.com");
    expect(userService.findOrCreate).toHaveBeenCalledWith({
      email: "test@example.com",
      name: "Test User",
      picture: "https://example.com/pic.jpg",
    });
  });

  it("returns 401 for missing token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.detail).toBe("Missing or invalid authorization header");
  });

  it("returns 401 for invalid token", async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("Invalid token"));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: {
        authorization: "Bearer invalid-token",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.detail).toBe("Invalid token");
  });
});

describe("Auth fail-closed behavior", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("throws in production when AUTH_AUTHORITY and AUTH_AUDIENCE are missing", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      AUTH_AUTHORITY: undefined,
      AUTH_AUDIENCE: undefined,
    };

    await expect(buildApp({ logger: false })).rejects.toThrow(
      "Fail-closed: AUTH_AUTHORITY and AUTH_AUDIENCE are required in production"
    );
  });

  it("starts without auth in development when env vars are missing", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      AUTH_AUTHORITY: undefined,
      AUTH_AUDIENCE: undefined,
    };

    const app = await buildApp({ logger: false });
    await app.ready();
    await app.close();
  });

  it("starts without auth in test when env vars are missing", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      AUTH_AUTHORITY: undefined,
      AUTH_AUDIENCE: undefined,
    };

    const app = await buildApp({ logger: false });
    await app.ready();
    await app.close();
  });
});
