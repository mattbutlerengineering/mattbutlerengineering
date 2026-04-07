import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    agentSession: { findMany: vi.fn().mockResolvedValue([]) },
  },
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
}));

vi.mock("../services/health-checks.js", () => ({
  checkAuth0: vi.fn().mockResolvedValue({ status: "ok", latency: 50 }),
  checkLatencyAnomaly: vi.fn().mockReturnValue({ isAnomaly: false, rollingAvg: 0 }),
  recordDbLatency: vi.fn(),
}));

vi.mock("@mbe/agent-core", () => ({
  runSession: vi.fn(),
  DEFAULT_SESSION_CONFIG: {},
  DEFAULT_FEEDBACK_LOOP_CONFIG: {},
  resolveBudget: vi.fn(),
  resolveModel: vi.fn(),
  routeModelWithReason: vi.fn(),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

// Mock rate limit monitor
const { mockGetSnapshot, mockRateLimitMonitor } = vi.hoisted(() => {
  const mockGetSnapshot = vi.fn().mockReturnValue({
    stats: { hits_last_hour: 0, blocked_ips: 0 },
    isDegraded: false,
  });
  const mockRateLimitMonitor = {
    recordHit: vi.fn(),
    getSnapshot: mockGetSnapshot,
    reset: vi.fn(),
  };
  return { mockGetSnapshot, mockRateLimitMonitor };
});

vi.mock("@mbe/observability", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createRateLimitMonitor: vi.fn().mockReturnValue(mockRateLimitMonitor),
  };
});

import { prisma } from "../services/database.js";
import { checkAuth0, checkLatencyAnomaly } from "../services/health-checks.js";

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
      expect(body.checks.database.status).toBe("ok");
      expect(body.checks.auth0.status).toBe("ok");
      expect(body.checks.auth0.latency).toBe(50);
    });

    it("returns degraded status when database is unhealthy", async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("Connection refused"));

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("degraded");
      expect(body.checks.database.status).toBe("error");
      expect(body.checks.database.message).toBe("Connection refused");
    });

    it("returns degraded status when Auth0 is unreachable", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);
      vi.mocked(checkAuth0).mockResolvedValueOnce({
        status: "degraded",
        latency: 2100,
        message: "Auth0 JWKS unreachable (timeout >2s)",
      });

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("degraded");
      expect(body.checks.auth0.status).toBe("degraded");
      expect(body.checks.auth0.message).toContain("timeout");
    });

    it("returns degraded status when latency anomaly detected", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);
      vi.mocked(checkLatencyAnomaly).mockReturnValueOnce({ isAnomaly: true, rollingAvg: 10 });

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("degraded");
      expect(body.checks.database.status).toBe("error");
      expect(body.checks.database.message).toContain("Latency anomaly");
    });

    it("includes rate_limits check with zero hits", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.checks.rate_limits).toBeDefined();
      expect(body.checks.rate_limits.status).toBe("ok");
      expect(body.checks.rate_limits.hits_last_hour).toBe(0);
      expect(body.checks.rate_limits.blocked_ips).toBe(0);
    });

    it("returns degraded when rate limit hits exceed threshold", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);

      mockGetSnapshot.mockReturnValueOnce({
        stats: { hits_last_hour: 75, blocked_ips: 12 },
        isDegraded: true,
      });

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("degraded");
      expect(body.checks.rate_limits.status).toBe("degraded");
      expect(body.checks.rate_limits.hits_last_hour).toBe(75);
      expect(body.checks.rate_limits.blocked_ips).toBe(12);
      expect(body.checks.rate_limits.message).toContain("High rate limit activity");
    });
  });

  describe("GET /api/gen/health", () => {
    it("returns ok status (gen ingress path)", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);

      const response = await app.inject({
        method: "GET",
        url: "/api/gen/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      expect(body.checks.auth0).toBeDefined();
    });
  });
});
