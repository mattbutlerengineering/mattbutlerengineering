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

vi.mock("./services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { buildApp } from "./app.js";

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
