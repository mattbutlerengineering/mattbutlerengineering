/**
 * Tests for app.ts — CORS origin validation and middleware registration.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("./services/user.js", () => ({
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

vi.mock("./services/database.js", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { buildApp } from "./app.js";

describe("app.ts — CORS validation", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("accepts valid mattbutlerengineering.com origins from CORS_ORIGINS", async () => {
    process.env = {
      ...originalEnv,
      CORS_ORIGINS: "https://mattbutlerengineering.com,https://subdomain.mattbutlerengineering.com",
    };

    const app = await buildApp({ logger: false });
    await app.ready();
    await app.close();
    // Should not throw — valid origins accepted
  });

  it("rejects invalid origins and falls back to defaults when all rejected", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      CORS_ORIGINS: "https://evil.com,https://attacker.io",
    };

    const app = await buildApp({ logger: false });
    await app.ready();

    // Should have warned about rejected origins
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[CORS] Rejected invalid origin")
    );
    // Should have warned about falling back to defaults
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[CORS] All CORS_ORIGINS were rejected")
    );

    await app.close();
    warnSpy.mockRestore();
  });

  it("accepts localhost origins in development mode", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      CORS_ORIGINS: "http://localhost:3000",
    };

    const app = await buildApp({ logger: false });
    await app.ready();
    await app.close();
    // No throw = localhost accepted in dev mode
  });

  it("rejects localhost origins in production mode", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.test.com",
      CORS_ORIGINS: "http://localhost:3000",
    };

    const app = await buildApp({ logger: false });
    await app.ready();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[CORS] Rejected invalid origin")
    );

    await app.close();
    warnSpy.mockRestore();
  });

  it("uses default origins when CORS_ORIGINS is not set", async () => {
    process.env = {
      ...originalEnv,
      CORS_ORIGINS: undefined,
    };

    const app = await buildApp({ logger: false });
    await app.ready();
    await app.close();
    // No throw = defaults used successfully
  });

  it("filters mixed valid/invalid origins from CORS_ORIGINS", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      CORS_ORIGINS: "https://mattbutlerengineering.com,https://evil.com",
    };

    const app = await buildApp({ logger: false });
    await app.ready();

    // Should warn about the rejected one
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("evil.com")
    );
    // But should NOT warn about fallback (at least one valid origin)
    const fallbackCalls = warnSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("falling back")
    );
    expect(fallbackCalls).toHaveLength(0);

    await app.close();
    warnSpy.mockRestore();
  });
});

describe("app.ts — health and API routes registration", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("registers health routes at /health", async () => {
    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    // Should get a response (not 404)
    expect(response.statusCode).not.toBe(404);

    await app.close();
  });

  it("registers readiness route at /ready", async () => {
    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).not.toBe(404);

    await app.close();
  });

  it("registers user routes under /api/v1/users prefix", async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.test.com",
    };

    const app = await buildApp({ logger: false });
    await app.ready();

    // Without auth token this should return 401, not 404
    const response = await app.inject({ method: "GET", url: "/api/v1/users/me" });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("builds app with default options (logger enabled)", async () => {
    const app = await buildApp();
    await app.ready();
    await app.close();
  });

  it("decorates rate limit onExceeded handler", async () => {
    const app: FastifyInstance = await buildApp({ logger: false });
    await app.ready();

    // rateLimitMonitor should be decorated
    expect((app as unknown as Record<string, unknown>).rateLimitMonitor).toBeDefined();

    await app.close();
  });
});
