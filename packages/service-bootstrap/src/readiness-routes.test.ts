import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerReadinessRoutes } from "./readiness-routes.js";

const mockPrisma = {
  $queryRaw: vi.fn(),
};

describe("registerReadinessRoutes", () => {
  let app: FastifyInstance;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AUTH_AUTHORITY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function buildApp(overrides?: {
    prisma?: typeof mockPrisma;
    fetchFn?: typeof fetch;
    auth0Url?: string;
    jwksTimeoutMs?: number;
  }): Promise<FastifyInstance> {
    const instance = Fastify({ logger: false });
    await instance.register(registerReadinessRoutes, {
      prisma: overrides?.prisma ?? mockPrisma,
      auth0Url: overrides?.auth0Url ?? "https://example.auth0.com/.well-known/jwks.json",
      fetchFn: overrides?.fetchFn,
      jwksTimeoutMs: overrides?.jwksTimeoutMs,
    });
    await instance.ready();
    return instance;
  }

  it("returns 200 with ready: true when all checks pass", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    app = await buildApp({ fetchFn: mockFetch });

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ready).toBe(true);
    expect(body.timestamp).toBeTruthy();
    expect(body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "database", status: "ok" }),
        expect.objectContaining({ name: "auth", status: "ok" }),
      ])
    );

    await app.close();
  });

  it("returns 503 with ready: false when database is unavailable", async () => {
    const failPrisma = { $queryRaw: vi.fn().mockRejectedValue(new Error("Connection refused")) };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    app = await buildApp({ prisma: failPrisma, fetchFn: mockFetch });

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.ready).toBe(false);
    expect(body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "database",
          status: "error",
          message: "Connection refused",
        }),
      ])
    );

    await app.close();
  });

  it("returns 503 with ready: false when JWKS endpoint is unavailable", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    app = await buildApp({ fetchFn: mockFetch });

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.ready).toBe(false);
    expect(body.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "auth", status: "error" })])
    );

    await app.close();
  });

  it("response includes timestamp in ISO format", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    app = await buildApp({ fetchFn: mockFetch });

    const response = await app.inject({ method: "GET", url: "/ready" });
    const body = JSON.parse(response.body);

    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);

    await app.close();
  });

  it("uses the provided auth0Url for the JWKS check", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const customUrl = "https://custom.auth0.com/.well-known/jwks.json";

    app = await buildApp({ fetchFn: mockFetch, auth0Url: customUrl });

    await app.inject({ method: "GET", url: "/ready" });

    expect(mockFetch).toHaveBeenCalledWith(customUrl, expect.anything());

    await app.close();
  });

  it("derives auth0Url from AUTH_AUTHORITY when no explicit auth0Url is passed", async () => {
    process.env.AUTH_AUTHORITY = "https://tenant.auth0.com";
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const instance = Fastify({ logger: false });
    await instance.register(registerReadinessRoutes, { prisma: mockPrisma, fetchFn: mockFetch });
    await instance.ready();
    app = instance;

    await app.inject({ method: "GET", url: "/ready" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://tenant.auth0.com/.well-known/jwks.json",
      expect.anything()
    );

    await app.close();
  });

  it("strips a trailing slash from AUTH_AUTHORITY when deriving auth0Url", async () => {
    process.env.AUTH_AUTHORITY = "https://tenant.auth0.com/";
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const instance = Fastify({ logger: false });
    await instance.register(registerReadinessRoutes, { prisma: mockPrisma, fetchFn: mockFetch });
    await instance.ready();
    app = instance;

    await app.inject({ method: "GET", url: "/ready" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://tenant.auth0.com/.well-known/jwks.json",
      expect.anything()
    );

    await app.close();
  });

  it("prefers an explicit auth0Url over AUTH_AUTHORITY-derived one", async () => {
    process.env.AUTH_AUTHORITY = "https://tenant.auth0.com";
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const customUrl = "https://custom.auth0.com/.well-known/jwks.json";

    app = await buildApp({ fetchFn: mockFetch, auth0Url: customUrl });

    await app.inject({ method: "GET", url: "/ready" });

    expect(mockFetch).toHaveBeenCalledWith(customUrl, expect.anything());

    await app.close();
  });

  it("falls back to the standard-checks default when AUTH_AUTHORITY is unset and no auth0Url is passed", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const instance = Fastify({ logger: false });
    await instance.register(registerReadinessRoutes, { prisma: mockPrisma, fetchFn: mockFetch });
    await instance.ready();
    app = instance;

    await app.inject({ method: "GET", url: "/ready" });

    // No AUTH_AUTHORITY and no explicit auth0Url — registerStandardChecks'
    // own default (AUTH0_JWKS_URL env var or the dev tenant) is used.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/.well-known/jwks.json"),
      expect.anything()
    );

    await app.close();
  });

  it("throws a clear error when AUTH_AUTHORITY is malformed", async () => {
    process.env.AUTH_AUTHORITY = "not a valid url";

    const instance = Fastify({ logger: false });

    await expect(
      instance.register(registerReadinessRoutes, { prisma: mockPrisma })
    ).rejects.toThrow(/AUTH_AUTHORITY/);
  });
});
