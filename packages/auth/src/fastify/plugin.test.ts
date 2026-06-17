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

    it("passes through when no Authorization header is present (permissive)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeUndefined();
      expect(mockJwtVerify).not.toHaveBeenCalled();
    });

    it("passes through when Authorization header is not Bearer (permissive)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: "Basic invalid-format",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeUndefined();
      expect(mockJwtVerify).not.toHaveBeenCalled();
    });

    it("returns RFC 9457 problem details with about:blank type on 401", async () => {
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
      expect(body.type).toBe("about:blank");
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
      expect(body.title).toBe("Unauthorized");
      expect(body.detail).toBe("Invalid token");
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
      expect(body.title).toBe("Unauthorized");
      expect(body.detail).toBe("Invalid token");
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

      expect(mockJwtVerify).toHaveBeenCalledWith("valid-token", "mock-jwks", {
        issuer: "https://test.auth0.com/",
        audience: "https://api.example.com",
      });
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
      // Without a token, the permissive hook passes through, then requireAuth rejects
      const response = await app.inject({
        method: "GET",
        url: "/with-require-auth",
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Unauthorized");
      expect(body.detail).toBe("Missing or invalid authorization header");
    });

    it("returns 401 and does not execute route handler when user is missing", async () => {
      const handlerSpy = vi.fn();

      // Create a separate app where requireAuth guards a route
      const spyApp = Fastify({ logger: false });
      const spyRoutesPlugin: FastifyPluginAsync = async (fastify) => {
        await fastify.register(authPlugin, {
          authority: "https://test.auth0.com",
          audience: "https://api.example.com",
        });

        fastify.get("/guarded", { preHandler: requireAuth }, async (_request, _reply) => {
          handlerSpy();
          return { data: "should not reach here" };
        });
      };

      await spyApp.register(spyRoutesPlugin);
      await spyApp.ready();

      const response = await spyApp.inject({
        method: "GET",
        url: "/guarded",
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Unauthorized");
      expect(body.detail).toBe("Missing or invalid authorization header");
      expect(handlerSpy).not.toHaveBeenCalled();

      await spyApp.close();
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
      delete process.env.AUTH_BYPASS_IN_TESTS;

      const options = getAuthPluginOptionsFromEnv();

      expect(options).toEqual({
        authority: "https://test.auth0.com",
        audience: "https://api.example.com",
        excludePaths: ["/health", "/docs", "/v1/webhooks"],
        bypassTestMode: false,
      });
    });

    it("sets bypassTestMode:true when AUTH_BYPASS_IN_TESTS=true", () => {
      process.env.AUTH_AUTHORITY = "https://test.auth0.com";
      process.env.AUTH_AUDIENCE = "https://api.example.com";
      process.env.AUTH_BYPASS_IN_TESTS = "true";

      const options = getAuthPluginOptionsFromEnv();

      expect(options.bypassTestMode).toBe(true);
    });

    it("sets bypassTestMode:false when AUTH_BYPASS_IN_TESTS is not 'true'", () => {
      process.env.AUTH_AUTHORITY = "https://test.auth0.com";
      process.env.AUTH_AUDIENCE = "https://api.example.com";
      process.env.AUTH_BYPASS_IN_TESTS = "false";

      const options = getAuthPluginOptionsFromEnv();

      expect(options.bypassTestMode).toBe(false);
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

  describe("bypassTestMode plugin option", () => {
    it("grants bypass identity when bypassTestMode:true and header is set", async () => {
      const bypassApp = Fastify({ logger: false });
      const bypassPlugin: FastifyPluginAsync = async (fastify) => {
        await fastify.register(authPlugin, {
          authority: "https://test.auth0.com",
          audience: "https://api.example.com",
          bypassTestMode: true,
        });
        fastify.get("/protected", async (request) => {
          return { user: request.user };
        });
      };
      await bypassApp.register(bypassPlugin);
      await bypassApp.ready();

      const response = await bypassApp.inject({
        method: "GET",
        url: "/protected",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user?.id).toBe("auth0|user-123");
      expect(mockJwtVerify).not.toHaveBeenCalled();

      await bypassApp.close();
    });

    it("does NOT bypass when bypassTestMode:false even if header is set", async () => {
      const noBypassApp = Fastify({ logger: false });
      const noBypassPlugin: FastifyPluginAsync = async (fastify) => {
        await fastify.register(authPlugin, {
          authority: "https://test.auth0.com",
          audience: "https://api.example.com",
          bypassTestMode: false,
        });
        fastify.get("/protected", { preHandler: requireAuth }, async (request) => {
          return { user: request.user };
        });
      };
      await noBypassApp.register(noBypassPlugin);
      await noBypassApp.ready();

      const response = await noBypassApp.inject({
        method: "GET",
        url: "/protected",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(401);
      expect(mockJwtVerify).not.toHaveBeenCalled();

      await noBypassApp.close();
    });

    it("requireAuth allows bypassed request when bypassTestMode:true", async () => {
      const bypassApp = Fastify({ logger: false });
      const bypassPlugin: FastifyPluginAsync = async (fastify) => {
        await fastify.register(authPlugin, {
          authority: "https://test.auth0.com",
          audience: "https://api.example.com",
          bypassTestMode: true,
        });
        fastify.get("/guarded", { preHandler: requireAuth }, async (request) => {
          return { user: request.user };
        });
      };
      await bypassApp.register(bypassPlugin);
      await bypassApp.ready();

      const response = await bypassApp.inject({
        method: "GET",
        url: "/guarded",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user?.id).toBe("auth0|user-123");

      await bypassApp.close();
    });
  });

  describe("AUTH_BYPASS_IN_TESTS production guard", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("grants bypass identity in non-production when bypassTestMode option + header are set", async () => {
      process.env.NODE_ENV = "test";

      const bypassApp = Fastify({ logger: false });
      const bypassRoutesPlugin: FastifyPluginAsync = async (fastify) => {
        await fastify.register(authPlugin, {
          authority: "https://test.auth0.com",
          audience: "https://api.example.com",
          excludePaths: ["/health"],
          bypassTestMode: true,
        });
        fastify.get("/protected", async (request) => {
          return { user: request.user };
        });
        fastify.get("/health", async () => {
          return { status: "ok" };
        });
      };
      await bypassApp.register(bypassRoutesPlugin);
      await bypassApp.ready();

      const response = await bypassApp.inject({
        method: "GET",
        url: "/protected",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user?.id).toBe("auth0|user-123");
      expect(mockJwtVerify).not.toHaveBeenCalled();

      await bypassApp.close();
    });

    it("does NOT bypass in production: requireAuth route 401s without a token", async () => {
      process.env.NODE_ENV = "production";

      const prodApp = Fastify({ logger: false });
      const prodRoutesPlugin: FastifyPluginAsync = async (fastify) => {
        await fastify.register(authPlugin, {
          authority: "https://test.auth0.com",
          audience: "https://api.example.com",
          bypassTestMode: true,
        });
        fastify.get("/guarded", { preHandler: requireAuth }, async (request) => {
          return { user: request.user };
        });
      };

      await prodApp.register(prodRoutesPlugin);
      await prodApp.ready();

      const response = await prodApp.inject({
        method: "GET",
        url: "/guarded",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Unauthorized");
      expect(mockJwtVerify).not.toHaveBeenCalled();

      await prodApp.close();
    });

    it("logs a prominent warning at registration when bypassTestMode:true", async () => {
      const warnSpy = vi.fn();
      const warnApp = Fastify({ logger: { level: "warn" } });
      warnApp.log.warn = warnSpy;

      const warnPlugin: FastifyPluginAsync = async (fastify) => {
        await fastify.register(authPlugin, {
          authority: "https://test.auth0.com",
          audience: "https://api.example.com",
          bypassTestMode: true,
        });
      };
      await warnApp.register(warnPlugin);
      await warnApp.ready();

      const bypassWarnings = warnSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === "string" && call[0].includes("AUTH_BYPASS_IN_TESTS")
      );
      expect(bypassWarnings.length).toBeGreaterThan(0);

      await warnApp.close();
    });

    it("does not log the bypass warning when bypassTestMode is unset", async () => {
      const warnSpy = vi.fn();
      const warnApp = Fastify({ logger: { level: "warn" } });
      warnApp.log.warn = warnSpy;

      await warnApp.register(testRoutesPlugin);
      await warnApp.ready();

      const bypassWarnings = warnSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === "string" && call[0].includes("AUTH_BYPASS_IN_TESTS")
      );
      expect(bypassWarnings).toHaveLength(0);

      await warnApp.close();
    });
  });

  describe("hasPermission", () => {
    it("returns false when user is undefined", async () => {
      const { hasPermission } = await import("./plugin.js");
      expect(hasPermission(undefined, "admin")).toBe(false);
    });

    it("returns false when user has no permissions array", async () => {
      const { hasPermission } = await import("./plugin.js");
      const user = { id: "u1", raw: { sub: "u1", iss: "", aud: "", exp: 0, iat: 0 } };
      expect(hasPermission(user as any, "admin")).toBe(false);
    });

    it("returns false when permissions is not an array", async () => {
      const { hasPermission } = await import("./plugin.js");
      const user = {
        id: "u1",
        raw: { sub: "u1", iss: "", aud: "", exp: 0, iat: 0, permissions: "admin" },
      };
      expect(hasPermission(user as any, "admin")).toBe(false);
    });

    it("returns false when permission not in array", async () => {
      const { hasPermission } = await import("./plugin.js");
      const user = {
        id: "u1",
        raw: { sub: "u1", iss: "", aud: "", exp: 0, iat: 0, permissions: ["read"] },
      };
      expect(hasPermission(user as any, "admin")).toBe(false);
    });

    it("returns true when permission is in array", async () => {
      const { hasPermission } = await import("./plugin.js");
      const user = {
        id: "u1",
        raw: { sub: "u1", iss: "", aud: "", exp: 0, iat: 0, permissions: ["admin", "read"] },
      };
      expect(hasPermission(user as any, "admin")).toBe(true);
    });
  });

  describe("rate-limit registration check", () => {
    it("logs a warning when rateLimit decorator is missing", async () => {
      const warnSpy = vi.fn();
      const warnApp = Fastify({
        logger: { level: "warn" },
      });
      // Override the log.warn to capture calls
      warnApp.log.warn = warnSpy;

      await warnApp.register(testRoutesPlugin);
      await warnApp.ready();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Auth plugin registered without rate limiting")
      );

      await warnApp.close();
    });

    it("does not log a warning when rateLimit decorator is present", async () => {
      const warnSpy = vi.fn();
      const limitApp = Fastify({
        logger: { level: "warn" },
      });
      limitApp.log.warn = warnSpy;

      // Simulate @fastify/rate-limit by decorating with rateLimit
      limitApp.decorate("rateLimit", () => {});

      await limitApp.register(testRoutesPlugin);
      await limitApp.ready();

      // Ensure the specific rate-limit warning was NOT emitted
      const rateLimitWarnings = warnSpy.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === "string" &&
          call[0].includes("Auth plugin registered without rate limiting")
      );
      expect(rateLimitWarnings).toHaveLength(0);

      await limitApp.close();
    });
  });
});
