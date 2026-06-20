import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerHealthRoutes, type HealthRoutesOptions } from "./health-routes.js";

// Mock dependencies
const mockPrisma = {
  $queryRaw: vi.fn(),
};

const mockDb = {
  prisma: mockPrisma as never,
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
};

const mockRateLimitMonitor = {
  recordHit: vi.fn(),
  getSnapshot: vi.fn().mockReturnValue({
    stats: { hits_last_hour: 0, blocked_ips: 0 },
    isDegraded: false,
  }),
  reset: vi.fn(),
};

const mockLatencyTracker = {
  record: vi.fn(),
  checkAnomaly: vi.fn().mockReturnValue({ isAnomaly: false, rollingAvg: 0 }),
};

const mockCheckAuth0 = vi.fn().mockResolvedValue({ status: "ok", latency: 50 });

function createTestOptions(overrides?: Partial<HealthRoutesOptions>): HealthRoutesOptions {
  return {
    db: mockDb,
    checkAuth0: mockCheckAuth0,
    routes: [
      { path: "/health", operationId: "getHealth" },
      { path: "/api/v1/test/health", operationId: "getTestHealth" },
    ],
    ...overrides,
  };
}

describe("registerHealthRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });

    // Decorate with apiVersion (simulating what services do)
    app.decorate("apiVersion", "v1");
    app.decorate("sunsetDate", "2027-01-01");
    // Decorate with shared observability (from createServiceApp)
    app.decorate("rateLimitMonitor", mockRateLimitMonitor);
    app.decorate("latencyTracker", mockLatencyTracker);
    app.decorate("getErrorRates", () => ({ endpoints: [], degraded: false }));
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("registers all specified routes", async () => {
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    expect(healthResponse.statusCode).toBe(200);

    const apiResponse = await app.inject({ method: "GET", url: "/api/v1/test/health" });
    expect(apiResponse.statusCode).toBe(200);
  });

  it("returns ok status when all checks pass", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    expect(body.status).toBe("ok");
    expect(body.version).toBe("1.0.0");
    expect(body.timestamp).toBeDefined();
    expect(body.checks).toBeDefined();
    expect(body.checks.database).toBeDefined();
    expect(body.checks.database.status).toBe("ok");
  });

  it("returns degraded when database ping fails", async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    expect(body.status).toBe("degraded");
    expect(body.checks.database.status).toBe("error");
    expect(body.checks.database.message).toContain("connection refused");
  });

  it("returns degraded when Auth0 is degraded", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockCheckAuth0.mockResolvedValueOnce({
      status: "degraded",
      latency: 2100,
      message: "Auth0 JWKS unreachable (timeout >2s)",
    });
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    expect(body.status).toBe("degraded");
    expect(body.checks.auth0.status).toBe("degraded");
  });

  it("returns degraded when pool utilization is high", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockDb.getPoolMetrics.mockReturnValueOnce({
      active: 5,
      idle: 0,
      busy: 5,
      size: 5,
      utilization: 1.0,
      isDegraded: true,
    });
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    expect(body.status).toBe("degraded");
    expect(body.checks.pool.status).toBe("degraded");
    expect(body.checks.pool.message).toContain("Pool utilization high");
  });

  it("returns degraded when error rates are high", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    // Override getErrorRates on the fastify instance for this test
    const appWithHighErrors = Fastify({ logger: false });
    appWithHighErrors.decorate("apiVersion", "v1");
    appWithHighErrors.decorate("sunsetDate", "2027-01-01");
    appWithHighErrors.decorate("rateLimitMonitor", mockRateLimitMonitor);
    appWithHighErrors.decorate("latencyTracker", mockLatencyTracker);
    appWithHighErrors.decorate("getErrorRates", () => ({
      endpoints: [{ endpoint: "/api/v1/test", total: 20, errors: 5, rate: 0.25 }],
      degraded: true,
    }));
    await appWithHighErrors.register(registerHealthRoutes, createTestOptions());
    await appWithHighErrors.ready();

    const response = await appWithHighErrors.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    await appWithHighErrors.close();
    expect(body.status).toBe("degraded");
  });

  it("returns degraded when rate limits are degraded", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockRateLimitMonitor.getSnapshot.mockReturnValueOnce({
      stats: { hits_last_hour: 500, blocked_ips: 10 },
      isDegraded: true,
    });
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    expect(body.status).toBe("degraded");
    expect(body.checks.rate_limits.status).toBe("degraded");
  });

  it("includes pool metrics in response", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    expect(body.checks.pool.active).toBe(1);
    expect(body.checks.pool.idle).toBe(4);
    expect(body.checks.pool.busy).toBe(1);
    expect(body.checks.pool.size).toBe(5);
    expect(body.checks.pool.utilization).toBe(0.2);
  });

  it("includes error_rates in top-level response", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    expect(body.error_rates).toBeDefined();
    expect(body.error_rates.endpoints).toBeDefined();
  });

  it("includes apiVersion and sunsetDate from server decorators", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    expect(body.apiVersion).toBe("v1");
    expect(body.sunsetDate).toBe("2027-01-01");
  });

  it("records db latency via tracker on successful ping", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    await app.inject({ method: "GET", url: "/health" });

    expect(mockLatencyTracker.record).toHaveBeenCalledWith(expect.any(Number));
    expect(mockLatencyTracker.checkAnomaly).toHaveBeenCalledWith(expect.any(Number));
  });

  it("detects latency anomaly and marks database check as error", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockLatencyTracker.checkAnomaly.mockReturnValueOnce({
      isAnomaly: true,
      rollingAvg: 5,
    });
    await app.register(registerHealthRoutes, createTestOptions());
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(response.body);

    expect(body.checks.database.status).toBe("error");
    expect(body.checks.database.message).toContain("Latency anomaly");
  });
});
