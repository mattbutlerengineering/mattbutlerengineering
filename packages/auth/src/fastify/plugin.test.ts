import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { JWTPayload as JoseJWTPayload } from "jose";

import {
  authPlugin,
  requireAuth,
  getAuthPluginOptionsFromEnv,
  hasPermission,
  isTestBypass,
  toAuthUser,
} from "./plugin.js";
import type { AuthPluginOptions, JwtVerifier } from "./plugin.js";

// A representative verified payload. This file never mocks the jose module:
// verification is exercised entirely through the injected `verifier` seam, so
// verification-failure branches need no module mocking or network I/O.
const validPayload: JoseJWTPayload = {
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

const passVerifier: JwtVerifier = async () => validPayload;
const failVerifier: JwtVerifier = async () => {
  throw new Error("Invalid token");
};

/**
 * Registers authPlugin behind a small routes plugin, injecting a test verifier
 * so no real jose/JWKS call is ever made.
 */
function makeRoutes(options: Partial<AuthPluginOptions> = {}): FastifyPluginAsync {
  return async (fastify) => {
    await fastify.register(authPlugin, {
      authority: "https://test.auth0.com",
      audience: "https://api.example.com",
      excludePaths: ["/health"],
      ...options,
    });

    fastify.get("/protected", async (request) => {
      return { user: request.user };
    });

    fastify.get("/health", async () => {
      return { status: "ok" };
    });
  };
}

describe("isTestBypass (pure predicate)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns true only when NODE_ENV=test AND bypassTestMode AND header is 'true'", () => {
    process.env.NODE_ENV = "test";
    expect(isTestBypass({ headers: { "x-auth-bypass": "true" } }, true)).toBe(true);
  });

  it("returns false when the header is missing", () => {
    process.env.NODE_ENV = "test";
    expect(isTestBypass({ headers: {} }, true)).toBe(false);
  });

  it("returns false when the header is not exactly 'true'", () => {
    process.env.NODE_ENV = "test";
    expect(isTestBypass({ headers: { "x-auth-bypass": "yes" } }, true)).toBe(false);
  });

  it("returns false when bypassTestMode is false", () => {
    process.env.NODE_ENV = "test";
    expect(isTestBypass({ headers: { "x-auth-bypass": "true" } }, false)).toBe(false);
  });

  it("returns false when NODE_ENV is not 'test'", () => {
    process.env.NODE_ENV = "production";
    expect(isTestBypass({ headers: { "x-auth-bypass": "true" } }, true)).toBe(false);
  });

  it("returns false when NODE_ENV is unset", () => {
    delete process.env.NODE_ENV;
    expect(isTestBypass({ headers: { "x-auth-bypass": "true" } }, true)).toBe(false);
  });
});

describe("toAuthUser (pure mapping)", () => {
  it("maps a full payload to an AuthUser", () => {
    expect(toAuthUser(validPayload)).toEqual({
      id: "auth0|user-123",
      email: "test@example.com",
      name: "Test User",
      picture: "https://example.com/pic.jpg",
      emailVerified: true,
      raw: validPayload,
    });
  });

  it("returns null when the payload has no string 'sub' claim", () => {
    const { sub: _sub, ...noSub } = validPayload;
    expect(toAuthUser(noSub)).toBeNull();
  });

  it("returns null when 'sub' is present but not a string", () => {
    expect(toAuthUser({ ...validPayload, sub: 123 as unknown as string })).toBeNull();
  });

  it("defaults missing standard claims and omits optional profile fields", () => {
    const user = toAuthUser({ sub: "u1" });
    expect(user).toEqual({
      id: "u1",
      email: undefined,
      name: undefined,
      picture: undefined,
      emailVerified: undefined,
      raw: { sub: "u1", iss: "", aud: "", exp: 0, iat: 0 },
    });
  });
});

describe("authPlugin onRequest (Fastify wiring, injected verifier)", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("populates request.user for a verified Bearer token", async () => {
    await app.register(makeRoutes({ verifier: passVerifier }));
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user).toEqual({
      id: "auth0|user-123",
      email: "test@example.com",
      name: "Test User",
      picture: "https://example.com/pic.jpg",
      emailVerified: true,
      raw: validPayload,
    });
  });

  it("passes through with no user when no Authorization header is present (permissive)", async () => {
    const verifier = vi.fn(passVerifier);
    await app.register(makeRoutes({ verifier }));
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user).toBeUndefined();
    expect(verifier).not.toHaveBeenCalled();
  });

  it("passes through when the Authorization header is not Bearer (permissive)", async () => {
    const verifier = vi.fn(passVerifier);
    await app.register(makeRoutes({ verifier }));
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Basic invalid-format" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user).toBeUndefined();
    expect(verifier).not.toHaveBeenCalled();
  });

  it("returns RFC 9457 problem details (about:blank) with 401 on verification failure", async () => {
    await app.register(makeRoutes({ verifier: failVerifier }));
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer invalid-token" },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe("Unauthorized");
    expect(body.detail).toBe("Invalid token");
  });

  it("returns 401 with a missing-sub detail when the verified payload has no sub", async () => {
    const noSubVerifier: JwtVerifier = async () => ({ iss: "x", aud: "y" });
    await app.register(makeRoutes({ verifier: noSubVerifier }));
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer no-sub-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).detail).toBe("Invalid token: missing sub");
  });

  it("skips verification for excluded paths", async () => {
    const verifier = vi.fn(passVerifier);
    await app.register(makeRoutes({ verifier }));
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe("ok");
    expect(verifier).not.toHaveBeenCalled();
  });

  it("registers with the default jose verifier when no verifier is injected", async () => {
    // No verifier option -> default jose adapter is constructed at registration.
    // No token is sent, so the permissive hook returns before any JWKS call.
    await app.register(makeRoutes());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/protected" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user).toBeUndefined();
  });
});

describe("requireAuth (Fastify wiring, injected verifier)", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  function registerGuarded(options: Partial<AuthPluginOptions> = {}) {
    const plugin: FastifyPluginAsync = async (fastify) => {
      await fastify.register(authPlugin, {
        authority: "https://test.auth0.com",
        audience: "https://api.example.com",
        excludePaths: ["/public"],
        ...options,
      });
      fastify.get("/with-require-auth", { preHandler: requireAuth }, async (request) => {
        return { user: request.user };
      });
      fastify.get("/public", async () => {
        return { status: "public" };
      });
    };
    return app.register(plugin);
  }

  it("passes through when the user is set", async () => {
    await registerGuarded({ verifier: passVerifier });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/with-require-auth",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user).toBeDefined();
  });

  it("returns 401 when no user is set (no token)", async () => {
    await registerGuarded({ verifier: passVerifier });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/with-require-auth" });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.title).toBe("Unauthorized");
    expect(body.detail).toBe("Missing or invalid authorization header");
  });

  it("does not execute the route handler when the user is missing", async () => {
    const handlerSpy = vi.fn();
    const plugin: FastifyPluginAsync = async (fastify) => {
      await fastify.register(authPlugin, {
        authority: "https://test.auth0.com",
        audience: "https://api.example.com",
        verifier: passVerifier,
      });
      fastify.get("/guarded", { preHandler: requireAuth }, async () => {
        handlerSpy();
        return { data: "should not reach here" };
      });
    };
    await app.register(plugin);
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/guarded" });

    expect(response.statusCode).toBe(401);
    expect(handlerSpy).not.toHaveBeenCalled();
  });
});

describe("test bypass (Fastify wiring)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let app: FastifyInstance;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    await app.close();
  });

  it("grants a bypass identity when bypassTestMode:true and the header is set", async () => {
    const verifier = vi.fn(passVerifier);
    await app.register(makeRoutes({ bypassTestMode: true, verifier }));
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user?.id).toBe("auth0|user-123");
    expect(verifier).not.toHaveBeenCalled();
  });

  it("does NOT bypass when bypassTestMode:false even if the header is set", async () => {
    const plugin: FastifyPluginAsync = async (fastify) => {
      await fastify.register(authPlugin, {
        authority: "https://test.auth0.com",
        audience: "https://api.example.com",
        bypassTestMode: false,
        verifier: passVerifier,
      });
      fastify.get("/protected", { preHandler: requireAuth }, async (request) => {
        return { user: request.user };
      });
    };
    await app.register(plugin);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("requireAuth allows a bypassed request when bypassTestMode:true", async () => {
    const plugin: FastifyPluginAsync = async (fastify) => {
      await fastify.register(authPlugin, {
        authority: "https://test.auth0.com",
        audience: "https://api.example.com",
        bypassTestMode: true,
        verifier: passVerifier,
      });
      fastify.get("/guarded", { preHandler: requireAuth }, async (request) => {
        return { user: request.user };
      });
    };
    await app.register(plugin);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/guarded",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user?.id).toBe("auth0|user-123");
  });

  it("does NOT bypass when NODE_ENV is unset even with bypassTestMode + header", async () => {
    delete process.env.NODE_ENV;
    const plugin: FastifyPluginAsync = async (fastify) => {
      await fastify.register(authPlugin, {
        authority: "https://test.auth0.com",
        audience: "https://api.example.com",
        bypassTestMode: true,
        verifier: passVerifier,
      });
      fastify.get("/guarded", { preHandler: requireAuth }, async (request) => {
        return { user: request.user };
      });
    };
    await app.register(plugin);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/guarded",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("does NOT bypass in production even with bypassTestMode + header", async () => {
    process.env.NODE_ENV = "production";
    const plugin: FastifyPluginAsync = async (fastify) => {
      await fastify.register(authPlugin, {
        authority: "https://test.auth0.com",
        audience: "https://api.example.com",
        bypassTestMode: true,
        verifier: passVerifier,
      });
      fastify.get("/guarded", { preHandler: requireAuth }, async (request) => {
        return { user: request.user };
      });
    };
    await app.register(plugin);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/guarded",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("bypass registration warning", () => {
  it("logs a prominent warning at registration when bypassTestMode:true", async () => {
    const warnSpy = vi.fn();
    const app = Fastify({ logger: { level: "warn" } });
    app.log.warn = warnSpy;

    await app.register(makeRoutes({ bypassTestMode: true, verifier: passVerifier }));
    await app.ready();

    const bypassWarnings = warnSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("AUTH_BYPASS_IN_TESTS")
    );
    expect(bypassWarnings.length).toBeGreaterThan(0);

    await app.close();
  });

  it("does not log the bypass warning when bypassTestMode is unset", async () => {
    const warnSpy = vi.fn();
    const app = Fastify({ logger: { level: "warn" } });
    app.log.warn = warnSpy;

    await app.register(makeRoutes({ verifier: passVerifier }));
    await app.ready();

    const bypassWarnings = warnSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("AUTH_BYPASS_IN_TESTS")
    );
    expect(bypassWarnings).toHaveLength(0);

    await app.close();
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

    expect(getAuthPluginOptionsFromEnv()).toEqual({
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

    expect(getAuthPluginOptionsFromEnv().bypassTestMode).toBe(true);
  });

  it("sets bypassTestMode:false when AUTH_BYPASS_IN_TESTS is not 'true'", () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.AUTH_BYPASS_IN_TESTS = "false";

    expect(getAuthPluginOptionsFromEnv().bypassTestMode).toBe(false);
  });

  it("throws when AUTH_AUTHORITY is missing", () => {
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    delete process.env.AUTH_AUTHORITY;

    expect(() => getAuthPluginOptionsFromEnv()).toThrow(
      "Missing required auth environment variables: AUTH_AUTHORITY, AUTH_AUDIENCE"
    );
  });

  it("throws when AUTH_AUDIENCE is missing", () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    delete process.env.AUTH_AUDIENCE;

    expect(() => getAuthPluginOptionsFromEnv()).toThrow(
      "Missing required auth environment variables: AUTH_AUTHORITY, AUTH_AUDIENCE"
    );
  });

  it("throws when both env vars are missing", () => {
    delete process.env.AUTH_AUTHORITY;
    delete process.env.AUTH_AUDIENCE;

    expect(() => getAuthPluginOptionsFromEnv()).toThrow(
      "Missing required auth environment variables: AUTH_AUTHORITY, AUTH_AUDIENCE"
    );
  });
});

describe("hasPermission", () => {
  it("returns false when user is undefined", () => {
    expect(hasPermission(undefined, "admin")).toBe(false);
  });

  it("returns false when user has no permissions array", () => {
    const user = { id: "u1", raw: { sub: "u1", iss: "", aud: "", exp: 0, iat: 0 } };
    expect(hasPermission(user, "admin")).toBe(false);
  });

  it("returns false when permissions is not an array", () => {
    const user = {
      id: "u1",
      raw: { sub: "u1", iss: "", aud: "", exp: 0, iat: 0, permissions: "admin" },
    };
    expect(hasPermission(user, "admin")).toBe(false);
  });

  it("returns false when the permission is not in the array", () => {
    const user = {
      id: "u1",
      raw: { sub: "u1", iss: "", aud: "", exp: 0, iat: 0, permissions: ["read"] },
    };
    expect(hasPermission(user, "admin")).toBe(false);
  });

  it("returns true when the permission is in the array", () => {
    const user = {
      id: "u1",
      raw: { sub: "u1", iss: "", aud: "", exp: 0, iat: 0, permissions: ["admin", "read"] },
    };
    expect(hasPermission(user, "admin")).toBe(true);
  });
});

describe("rate-limit registration check", () => {
  it("logs a warning when the rateLimit decorator is missing", async () => {
    const warnSpy = vi.fn();
    const app = Fastify({ logger: { level: "warn" } });
    app.log.warn = warnSpy;

    await app.register(makeRoutes({ verifier: passVerifier }));
    await app.ready();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Auth plugin registered without rate limiting")
    );

    await app.close();
  });

  it("does not log a warning when the rateLimit decorator is present", async () => {
    const warnSpy = vi.fn();
    const app = Fastify({ logger: { level: "warn" } });
    app.log.warn = warnSpy;
    app.decorate("rateLimit", () => {});

    await app.register(makeRoutes({ verifier: passVerifier }));
    await app.ready();

    const rateLimitWarnings = warnSpy.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("Auth plugin registered without rate limiting")
    );
    expect(rateLimitWarnings).toHaveLength(0);

    await app.close();
  });
});
