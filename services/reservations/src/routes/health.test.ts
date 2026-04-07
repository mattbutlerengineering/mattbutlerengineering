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
      expect(body.version).toBe("1.0.0");
      expect(body.checks.database.status).toBe("ok");
      expect(typeof body.checks.database.latency).toBe("number");
      expect(body.checks.auth0.status).toBe("ok");
      expect(body.checks.auth0.latency).toBe(50);
    });

    it("returns degraded status when database is unhealthy", async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
        new Error("Connection refused")
      );

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
  });

  describe("GET /api/health", () => {
    it("returns ok status when database is healthy (ingress-prefixed path)", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);

      const response = await app.inject({
        method: "GET",
        url: "/api/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      expect(body.version).toBe("1.0.0");
      expect(body.checks.database.status).toBe("ok");
      expect(typeof body.checks.database.latency).toBe("number");
    });

    it("returns degraded status when database is unhealthy (ingress-prefixed path)", async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
        new Error("Connection refused")
      );

      const response = await app.inject({
        method: "GET",
        url: "/api/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("degraded");
      expect(body.checks.database.status).toBe("error");
      expect(body.checks.database.message).toBe("Connection refused");
    });
  });

  describe("GET /api/v1/reservations/health", () => {
    it("returns ok status when database is healthy (reservations ingress path)", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reservations/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      expect(body.version).toBe("1.0.0");
      expect(body.checks.database.status).toBe("ok");
      expect(typeof body.checks.database.latency).toBe("number");
    });

    it("returns degraded status when database is unhealthy (reservations ingress path)", async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
        new Error("Connection refused")
      );

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reservations/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("degraded");
      expect(body.checks.database.status).toBe("error");
      expect(body.checks.database.message).toBe("Connection refused");
    });
  });
});
