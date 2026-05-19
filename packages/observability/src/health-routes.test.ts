import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import { registerHealthRoutes } from "./health-routes.js";
import { errorRatePlugin_ } from "./error-rates.js";
import type { HealthRouteOptions } from "./health-routes.js";
import type { RateLimitMonitor } from "./rate-limit-monitor.js";

function buildMockDb(overrides?: Partial<HealthRouteOptions["db"]>): HealthRouteOptions["db"] {
  return {
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
    ...overrides,
  };
}

function buildMockPrisma(resolveValue?: unknown) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(resolveValue ?? [{ "?column?": 1 }]),
  };
}

function buildMockRateLimitMonitor(isDegraded = false): RateLimitMonitor {
  return {
    recordHit: vi.fn(),
    reset: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({
      stats: { hits_last_hour: 0, blocked_ips: 0 },
      isDegraded,
    }),
  };
}

async function buildTestApp(
  options: Partial<HealthRouteOptions> & {
    prisma?: HealthRouteOptions["prisma"];
    db?: HealthRouteOptions["db"];
    rateLimitMonitor?: RateLimitMonitor;
  } = {}
) {
  const {
    prisma = buildMockPrisma(),
    db = buildMockDb(),
    rateLimitMonitor = buildMockRateLimitMonitor(),
    routes = [{ path: "/health", operationId: "getHealth" }],
    checkAuth0 = vi.fn().mockResolvedValue({ status: "ok", latency: 50 }),
    checkLatencyAnomaly = vi.fn().mockReturnValue({ isAnomaly: false, rollingAvg: 0 }),
    recordDbLatency = vi.fn(),
  } = options;

  const fastify = Fastify({ logger: false });

  // Decorate with rateLimitMonitor (as done in app.ts)
  fastify.decorate("rateLimitMonitor", rateLimitMonitor);

  // Decorate with API versioning fields (as done by apiVersioningPlugin)
  fastify.decorate("apiVersion", "v1");
  fastify.decorate("successorVersion", undefined);
  fastify.decorate("sunsetDate", "2099-01-01");

  // Register error rate plugin (needed for getErrorRates())
  await fastify.register(errorRatePlugin_);

  // Register health routes under test
  await fastify.register(
    fp(async (f) => {
      await registerHealthRoutes(f, {
        prisma,
        db,
        routes,
        checkAuth0,
        checkLatencyAnomaly,
        recordDbLatency,
      });
    })
  );

  await fastify.ready();
  return fastify;
}

describe("registerHealthRoutes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  it("returns 200 with ok status when all checks pass", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBe("1.0.0");
  });

  it("includes all expected check keys", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(res.body);
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("slow_queries");
    expect(body.checks).toHaveProperty("auth0");
    expect(body.checks).toHaveProperty("rate_limits");
    expect(body.checks).toHaveProperty("pool");
  });

  it("includes error_rates in response", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(res.body);
    expect(body.error_rates).toBeDefined();
    expect(body.error_rates.degraded).toBe(false);
  });

  it("includes pool metrics in response", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(res.body);
    expect(body.checks.pool.status).toBe("ok");
    expect(body.checks.pool.active).toBe(1);
    expect(body.checks.pool.idle).toBe(4);
    expect(body.checks.pool.busy).toBe(1);
    expect(body.checks.pool.size).toBe(5);
    expect(body.checks.pool.utilization).toBe(0.2);
  });

  it("returns degraded when DB ping fails", async () => {
    app = await buildTestApp({
      prisma: {
        $queryRaw: vi.fn().mockRejectedValue(new Error("Connection refused")),
      },
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("degraded");
    expect(body.checks.database.status).toBe("error");
    expect(body.checks.database.message).toContain("Connection refused");
  });

  it("returns degraded when pool utilization is high", async () => {
    app = await buildTestApp({
      db: buildMockDb({
        getPoolMetrics: vi.fn().mockReturnValue({
          active: 5,
          idle: 0,
          busy: 5,
          size: 5,
          utilization: 1.0,
          isDegraded: true,
        }),
      }),
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(res.body);
    expect(body.status).toBe("degraded");
    expect(body.checks.pool.status).toBe("degraded");
    expect(body.checks.pool.message).toContain("Pool utilization high");
  });

  it("returns degraded when rate limits are triggered", async () => {
    app = await buildTestApp({
      rateLimitMonitor: buildMockRateLimitMonitor(true),
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(res.body);
    expect(body.status).toBe("degraded");
    expect(body.checks.rate_limits.status).toBe("degraded");
  });

  it("returns degraded when auth0 is unreachable", async () => {
    app = await buildTestApp({
      checkAuth0: vi.fn().mockResolvedValue({
        status: "degraded",
        latency: 2001,
        message: "Auth0 JWKS unreachable (timeout >2s)",
      }),
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(res.body);
    expect(body.status).toBe("degraded");
    expect(body.checks.auth0.status).toBe("degraded");
  });

  it("registers multiple routes from options.routes", async () => {
    app = await buildTestApp({
      routes: [
        { path: "/health", operationId: "getHealth" },
        { path: "/api/v1/test/health", operationId: "getHealthApiTest" },
      ],
    });

    const res1 = await app.inject({ method: "GET", url: "/health" });
    const res2 = await app.inject({ method: "GET", url: "/api/v1/test/health" });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(JSON.parse(res1.body).status).toBe("ok");
    expect(JSON.parse(res2.body).status).toBe("ok");
  });

  it("uses injected checkLatencyAnomaly to detect DB latency anomaly", async () => {
    const anomalyCheck = vi.fn().mockReturnValue({ isAnomaly: true, rollingAvg: 5 });
    app = await buildTestApp({ checkLatencyAnomaly: anomalyCheck });

    const res = await app.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(res.body);
    expect(body.checks.database.status).toBe("error");
    expect(body.checks.database.message).toContain("Latency anomaly");
  });
});
