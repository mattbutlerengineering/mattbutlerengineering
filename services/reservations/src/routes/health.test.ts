import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the services
vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    list: vi.fn(),
    listByUserId: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  venueGroupService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../services/guest.js", () => ({
  guestService: {
    list: vi.fn(),
    getById: vi.fn(),
    search: vi.fn(),
    findOrCreate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getSegments: vi.fn(),
  },
}));

vi.mock("../services/floor-plan.js", () => ({
  floorPlanService: {
    list: vi.fn(),
    getById: vi.fn(),
    getActiveByVenueId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setActive: vi.fn(),
    updateTablePosition: vi.fn(),
    bulkUpdateTablePositions: vi.fn(),
    assignTableToFloorPlan: vi.fn(),
    removeTableFromFloorPlan: vi.fn(),
  },
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
}));

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
const { _mockGetSnapshot, mockRateLimitMonitor } = vi.hoisted(() => {
  const mockGetSnapshot = vi.fn().mockReturnValue({
    stats: { hits_last_hour: 0, blocked_ips: 0 },
    isDegraded: false,
  });
  const mockRateLimitMonitor = {
    recordHit: vi.fn(),
    getSnapshot: mockGetSnapshot,
    reset: vi.fn(),
  };
  return { _mockGetSnapshot, mockRateLimitMonitor };
});

vi.mock("@mbe/observability", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createRateLimitMonitor: vi.fn().mockReturnValue(mockRateLimitMonitor),
    errorRatePlugin_: actual.errorRatePlugin_,
  };
});

import { prisma } from "../services/database.js";

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
        endpoints: [{ endpoint: "/api/reservations", total: 10, errors: 5, rate: 0.5 }],
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
  });
});
