import { describe, it, expect, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServiceApp, type ServiceAppConfig } from "./create-service-app.js";
import { HEALTH_RATE_LIMIT } from "./health-routes.js";

/**
 * Exercises the REAL @fastify/rate-limit plugin (create-service-app.test.ts
 * mocks it out). The round-trip/status probes share an egress IP and burst
 * together, so a limiter on health/readiness turned a healthy service into a
 * 429 "degraded" reading (#8260, Sentry USERS-API-6T / AGENT-API-B).
 */
const BURST = 120; // above both the old 10/min health limit and the 100/min global one

function createStubDb() {
  return {
    prisma: { $queryRaw: vi.fn().mockResolvedValue([]) },
    getSlowQueryStats: () => ({ count5min: 0, slowestMs: 0 }),
    getServiceStatus: () => "ok" as const,
    getPoolMetrics: () => ({
      total: 5,
      busy: 1,
      idle: 4,
      waiting: 0,
      utilization: 0.2,
      isDegraded: false,
    }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

function testConfig(): ServiceAppConfig {
  return {
    swagger: {
      title: "Test API",
      description: "Test API description",
      serverUrl: "http://localhost:9999",
    },
    database: {
      db: createStubDb() as never,
      checkAuth0: async () => ({ status: "ok", latency: 1 }),
      healthRoutes: [
        { path: "/health", operationId: "getTestHealth" },
        { path: "/api/v1/test/health", operationId: "getTestHealthApi" },
      ],
    },
  };
}

async function burst(app: FastifyInstance, url: string, count = BURST): Promise<number[]> {
  const codes: number[] = [];
  for (let i = 0; i < count; i++) {
    const res = await app.inject({ method: "GET", url });
    codes.push(res.statusCode);
  }
  return codes;
}

describe("createServiceApp — health and readiness get a generous probe rate limit", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (app) await app.close();
    app = undefined;
  });

  it.each(["/health", "/api/v1/test/health"])("never answers 429 on %s", async (url) => {
    app = await createServiceApp(testConfig(), { logger: false });
    await app.ready();

    const codes = await burst(app, url);

    expect(codes).not.toContain(429);
    expect(codes.every((c) => c === 200)).toBe(true);
  });

  it("never answers 429 on /ready", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    app = await createServiceApp(testConfig(), { logger: false });
    await app.ready();

    const codes = await burst(app, "/ready");

    expect(codes).not.toContain(429);
  });

  it("still caps a flood on /health above the probe limit", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    await app.ready();

    const codes = await burst(app, "/health", HEALTH_RATE_LIMIT.max + 1);

    expect(codes.slice(0, HEALTH_RATE_LIMIT.max).every((c) => c === 200)).toBe(true);
    expect(codes[HEALTH_RATE_LIMIT.max]).toBe(429);
  });

  it("still rate-limits a normal route at the global 100/min", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    app.get("/api/v1/test/things", async () => ({ ok: true }));
    await app.ready();

    const codes = await burst(app, "/api/v1/test/things");

    expect(codes.slice(0, 100).every((c) => c === 200)).toBe(true);
    expect(codes[100]).toBe(429);
  });
});
