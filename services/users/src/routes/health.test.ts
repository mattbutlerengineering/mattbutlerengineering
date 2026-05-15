import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the database
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

// Mock health checks
vi.mock("../services/health-checks.js", () => ({
  checkAuth0: vi.fn().mockResolvedValue({ status: "ok", latency: 50 }),
  checkLatencyAnomaly: vi.fn().mockReturnValue({ isAnomaly: false, rollingAvg: 0 }),
  recordDbLatency: vi.fn(),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

// Mock rate limit monitor
interface MockRateLimitMonitor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordHit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSnapshot: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reset: any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { _mockGetSnapshot, mockRateLimitMonitor } = vi.hoisted(
  (): { _mockGetSnapshot: any; mockRateLimitMonitor: MockRateLimitMonitor } => {
    const mockGetSnapshot = vi.fn().mockReturnValue({
      stats: { hits_last_hour: 0, blocked_ips: 0 },
      isDegraded: false,
    });
    const mockRateLimitMonitor = {
      recordHit: vi.fn(),
      getSnapshot: mockGetSnapshot,
      reset: vi.fn(),
    };
    return { _mockGetSnapshot: mockGetSnapshot, mockRateLimitMonitor };
  }
);

// Use the mock to satisfy noUnusedLocals
void _mockGetSnapshot;

vi.mock("@mbe/observability", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createRateLimitMonitor: vi.fn().mockReturnValue(mockRateLimitMonitor),
    errorRatePlugin_: actual.errorRatePlugin_,
  };
});

import { prisma, getPoolMetrics } from "../services/database.js";

describe("Health Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("GET /health", () => {
    it("returns ok status when database is healthy", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
    });

    it("includes error_rates in response", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error_rates).toBeDefined();
    });

    it("returns degraded status when error rates are high", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);

      vi.spyOn(app, "getErrorRates").mockReturnValue({
        endpoints: [{ endpoint: "/api/v1/users", total: 20, errors: 5, rate: 0.25 }],
        degraded: true,
      });

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("degraded");
    });

    it("includes pool check in health response", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.checks.pool).toBeDefined();
      expect(body.checks.pool.status).toBe("ok");
      expect(body.checks.pool.active).toBe(1);
      expect(body.checks.pool.idle).toBe(4);
      expect(body.checks.pool.busy).toBe(1);
      expect(body.checks.pool.size).toBe(5);
      expect(body.checks.pool.utilization).toBe(0.2);
    });

    it("returns degraded status when pool utilization is high", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);
      vi.mocked(getPoolMetrics).mockReturnValueOnce({
        active: 5,
        idle: 0,
        busy: 5,
        size: 5,
        utilization: 1.0,
        isDegraded: true,
      });

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("degraded");
      expect(body.checks.pool.status).toBe("degraded");
      expect(body.checks.pool.message).toContain("Pool utilization high");
    });
  });
});
