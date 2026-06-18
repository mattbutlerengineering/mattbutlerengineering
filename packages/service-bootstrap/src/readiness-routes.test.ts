import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerReadinessRoutes } from "./readiness-routes.js";

const mockPrisma = {
  $queryRaw: vi.fn(),
};

describe("registerReadinessRoutes", () => {
  let app: FastifyInstance;

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
});
