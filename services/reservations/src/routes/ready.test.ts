import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

// Stub fetch at module scope so registerStandardChecks (called when
// registerReadinessRoutes is registered in app.ts) captures this mock rather
// than the real globalThis.fetch.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { prisma } = await import("../services/database.js");
const { buildApp } = await import("../app.js");

describe("GET /ready", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with ready: true when all checks pass", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

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
  });

  it("returns 503 with ready: false when database is unavailable", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("Connection refused"));
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

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
  });

  it("returns 503 with ready: false when JWKS endpoint is unavailable", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "auth",
          status: "error",
          message: "JWKS returned 500",
        }),
      ])
    );
  });
});
