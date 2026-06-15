import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
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

// Stub fetch at module scope so registerStandardChecks (called at module load
// time in ready.ts) captures this mock rather than the real globalThis.fetch.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { prisma } = await import("../services/database.js");
const { buildApp } = await import("../app.js");

describe("Readiness Probe Route", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 when all dependencies are ready", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }] as Record<string, unknown>[]);
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ready).toBe(true);
    expect(body.checks).toContainEqual(expect.objectContaining({ name: "database", status: "ok" }));
    expect(body.checks).toContainEqual(expect.objectContaining({ name: "auth", status: "ok" }));
  });

  it("returns 503 when a dependency fails", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("DB Down"));
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.ready).toBe(false);
    expect(body.checks).toContainEqual(
      expect.objectContaining({
        name: "database",
        status: "error",
        message: "DB Down",
      })
    );
  });

  it("returns 503 when JWKS check fails", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }] as Record<string, unknown>[]);
    mockFetch.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.checks).toContainEqual(
      expect.objectContaining({
        name: "auth",
        status: "error",
        message: "JWKS returned 500",
      })
    );
  });
});
