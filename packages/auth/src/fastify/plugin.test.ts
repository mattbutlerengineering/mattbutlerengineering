import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";

// Use vi.hoisted for proper ESM mock hoisting
const mockJwtVerify = vi.hoisted(() => vi.fn());
const mockCreateRemoteJWKSet = vi.hoisted(() => vi.fn(() => "mock-jwks"));

vi.mock("jose", () => ({
  createRemoteJWKSet: mockCreateRemoteJWKSet,
  jwtVerify: mockJwtVerify,
}));

import { authPlugin, requireAuth, getAuthPluginOptionsFromEnv } from "./plugin.js";

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
};

// Test routes plugin that uses authPlugin
const testRoutesPlugin: FastifyPluginAsync<{ excludePaths?: string[] }> = async (
  fastify,
  options
) => {
  await fastify.register(authPlugin, {
    authority: "https://test.auth0.com",
    audience: "https://api.example.com",
    excludePaths: options.excludePaths ?? ["/health"],
  });

  fastify.get("/protected", async (request) => {
    return { user: request.user };
  });

  fastify.get("/health", async () => {
    return { status: "ok" };
  });
};

describe("Auth Plugin", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  describe("authPlugin", () => {
    beforeEach(async () => {
      await app.register(testRoutesPlugin, { excludePaths: ["/health"] });
      await app.ready();
    });

    it("populates request.user with valid token", async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      });

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toEqual({
        id: "auth0|user-123",
        email: "test@example.com",
        name: "Test User",
        picture: "https://example.com/pic.jpg",
        emailVerified: true,
        raw: mockJWTPayload,
      });
    });

    it("returns 401 for missing Authorization header", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Missing or invalid authorization header");
    });

    it("returns 401 for invalid header format (no Bearer)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: "Basic invalid-format",
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Missing or invalid authorization header");
    });

    it("returns 401 for invalid/malformed token", async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error("Invalid token"));

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Invalid token");
    });

    it("returns 401 for expired token", async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error("Token expired"));

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: "Bearer expired-token",
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Invalid token");
    });

    it("bypasses auth for excluded paths", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      expect(mockJwtVerify).not.toHaveBeenCalled();
    });

    it("verifies token with correct issuer and audience", async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      });

      await app.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(mockJwtVerify).toHaveBeenCalledWith(
        "valid-token",
        "mock-jwks",
        {
          issuer: "https://test.auth0.com/",
          audience: "https://api.example.com",
        }
      );
    });
  });

  describe("requireAuth", () => {
    beforeEach(async () => {
      // Create plugin that uses requireAuth as preHandler
      const requireAuthRoutesPlugin: FastifyPluginAsync = async (fastify) => {
        await fastify.register(authPlugin, {
          authority: "https://test.auth0.com",
          audience: "https://api.example.com",
          excludePaths: ["/public"],
        });

        // Protected route with additional requireAuth check
        fastify.get("/with-require-auth", { preHandler: requireAuth }, async (request) => {
          return { user: request.user };
        });

        // Public route for comparison
        fastify.get("/public", async () => {
          return { status: "public" };
        });
      };

      await app.register(requireAuthRoutesPlugin);
      await app.ready();
    });

    it("passes through when user is set", async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      });

      const response = await app.inject({
        method: "GET",
        url: "/with-require-auth",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeDefined();
    });

    it("returns 401 when user is not set (no token)", async () => {
      // Without a token, the auth plugin hook returns 401 before requireAuth runs
      const response = await app.inject({
        method: "GET",
        url: "/with-require-auth",
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Missing or invalid authorization header");
    });
  });

  describe("getAuthPluginOptionsFromEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("returns options object when env vars are set", () => {
      process.env.AUTH_AUTHORITY = "https://test.auth0.com";
      process.env.AUTH_AUDIENCE = "https://api.example.com";

      const options = getAuthPluginOptionsFromEnv();

      expect(options).toEqual({
        authority: "https://test.auth0.com",
        audience: "https://api.example.com",
        excludePaths: ["/health", "/api/v1/docs"],
      });
    });

    it("throws error when AUTH_AUTHORITY is missing", () => {
      process.env.AUTH_AUDIENCE = "https://api.example.com";
      delete process.env.AUTH_AUTHORITY;

      expect(() => getAuthPluginOptionsFromEnv()).toThrow(
        "Missing required auth environment variables: AUTH_AUTHORITY, AUTH_AUDIENCE"
      );
    });

    it("throws error when AUTH_AUDIENCE is missing", () => {
      process.env.AUTH_AUTHORITY = "https://test.auth0.com";
      delete process.env.AUTH_AUDIENCE;

      expect(() => getAuthPluginOptionsFromEnv()).toThrow(
        "Missing required auth environment variables: AUTH_AUTHORITY, AUTH_AUDIENCE"
      );
    });

    it("throws error when both env vars are missing", () => {
      delete process.env.AUTH_AUTHORITY;
      delete process.env.AUTH_AUDIENCE;

      expect(() => getAuthPluginOptionsFromEnv()).toThrow(
        "Missing required auth environment variables: AUTH_AUTHORITY, AUTH_AUDIENCE"
      );
    });
  });
});
