import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock database before importing app
vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
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

vi.mock("../services/health-checks.js", () => ({
  checkAuth0: vi.fn().mockResolvedValue({ status: "ok", latency: 10 }),
  checkLatencyAnomaly: vi.fn().mockReturnValue({ isAnomaly: false, rollingAvg: 5 }),
  recordDbLatency: vi.fn(),
}));

vi.mock("@mbe/auth/fastify", () => ({
  authPlugin: vi.fn().mockImplementation(async () => {}),
  getAuthPluginOptionsFromEnv: () => ({}),
  requireAuth: vi.fn().mockImplementation(async () => {}),
}));

vi.mock("@mbe/observability/sentry/node", () => ({
  sentryFastifyPlugin: vi.fn().mockImplementation(async () => {}),
}));

vi.mock("@mbe/observability", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const original = await importOriginal<typeof import("@mbe/observability")>();
  return {
    ...original,
    initTelemetry: vi.fn().mockReturnValue({ start: vi.fn() }),
    createRequestIdMiddleware: vi.fn().mockImplementation(() => async () => {}),
  };
});

// Mock fetch globally for JWKS check
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GET /ready", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Default: both checks succeed
    const { prisma } = await import("../services/database.js");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const { buildApp } = await import("../app.js");
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with ready: true when all checks pass", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

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
    const { prisma } = await import("../services/database.js");
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("Connection refused"));

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

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

  it("returns 503 with ready: false when JWKS is unavailable", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.ready).toBe(false);
    expect(body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "auth",
          status: "error",
          message: expect.stringContaining("JWKS returned 500"),
        }),
      ])
    );
  });

  it("does not affect the existing /health endpoint", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBeDefined();
    expect(body.version).toBe("1.0.0");
    // /health should NOT have the readiness fields
    expect(body.ready).toBeUndefined();
  });
});
