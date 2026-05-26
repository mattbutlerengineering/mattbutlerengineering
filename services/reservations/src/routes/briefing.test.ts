import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

vi.mock("../services/briefing.js", () => ({
  briefingService: {
    getBriefing: vi.fn(),
  },
}));

vi.mock("../services/guest.js", () => ({
  guestService: {
    list: vi.fn(),
    getById: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
    findOrCreate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    recordVisit: vi.fn(),
    search: vi.fn(),
    getSegments: vi.fn(),
    addNote: vi.fn(),
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

vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listByUserId: vi.fn(),
    createWithConflictCheck: vi.fn(),
    updateWithConflictCheck: vi.fn(),
    createWalkIn: vi.fn(),
    cancel: vi.fn(),
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
  getPoolMetrics: vi.fn().mockReturnValue({
    active: 1,
    idle: 4,
    busy: 1,
    size: 5,
    utilization: 0.2,
    isDegraded: false,
  }),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { briefingService } from "../services/briefing.js";
import { jwtVerify } from "jose";

const mockBriefingReservation = {
  id: "res-1",
  startTime: "2026-05-26T18:00:00.000Z",
  endTime: "2026-05-26T19:30:00.000Z",
  partySize: 2,
  status: "CONFIRMED" as const,
  notes: "Anniversary dinner",
  occasion: "anniversary" as const,
  seatingPreference: "window" as const,
  guestName: "Jane Smith",
  tableId: "table-1",
  tableName: "Table 1",
  venueId: "venue-1",
  guest: {
    id: "guest-1",
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "+1-555-987-6543",
    visitCount: 4,
    lastVisit: "2026-04-01T19:00:00.000Z",
    dietaryRestrictions: ["gluten-free"],
    tags: ["VIP"],
    staffNotes: [{ text: "Prefers quiet corner", createdBy: "staff-1", createdAt: "2026-01-01T00:00:00.000Z" }],
  },
};

const mockBriefingResponse = {
  date: "2026-05-26",
  venueId: "venue-1",
  reservations: [mockBriefingReservation],
};

const mockJWTPayload = {
  sub: "auth0|user-123",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: "test@example.com",
  email_verified: true,
  name: "Test User",
  picture: "https://example.com/pic.jpg",
};

describe("Briefing Routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({ logger: false });
    await app.ready();

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockJWTPayload,
      protectedHeader: { alg: "RS256" },
    } as never);
  });

  afterEach(async () => {
    process.env = originalEnv;
    await app.close();
    vi.clearAllMocks();
  });

  describe("GET /api/v1/briefing", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("Invalid token"));

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/briefing?venueId=venue-1",
        headers: { authorization: "Bearer invalid-token" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns briefing data with reservations", async () => {
      vi.mocked(briefingService.getBriefing).mockResolvedValueOnce({
        success: true,
        data: mockBriefingResponse,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/briefing?venueId=venue-1&date=2026-05-26",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.date).toBe("2026-05-26");
      expect(body.venueId).toBe("venue-1");
      expect(body.reservations).toHaveLength(1);
      expect(body.reservations[0].guest.dietaryRestrictions).toEqual(["gluten-free"]);
      expect(body.reservations[0].occasion).toBe("anniversary");
    });

    it("returns 404 when venue not found", async () => {
      vi.mocked(briefingService.getBriefing).mockResolvedValueOnce({
        success: false,
        error: "VENUE_NOT_FOUND",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/briefing?venueId=nonexistent",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 400 when venueId is missing", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/briefing",
        headers: { authorization: "Bearer valid-token" },
      });

      // Fastify validation rejects missing required query param
      expect(response.statusCode).toBe(400);
    });

    it("passes date to briefing service", async () => {
      vi.mocked(briefingService.getBriefing).mockResolvedValueOnce({
        success: true,
        data: { date: "2026-06-01", venueId: "venue-1", reservations: [] },
      });

      await app.inject({
        method: "GET",
        url: "/api/v1/briefing?venueId=venue-1&date=2026-06-01",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(briefingService.getBriefing).toHaveBeenCalledWith({
        venueId: "venue-1",
        date: "2026-06-01",
      });
    });

    it("returns empty reservations array for date with no bookings", async () => {
      vi.mocked(briefingService.getBriefing).mockResolvedValueOnce({
        success: true,
        data: { date: "2026-05-26", venueId: "venue-1", reservations: [] },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/briefing?venueId=venue-1&date=2026-05-26",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.reservations).toEqual([]);
    });

    it("enriches reservations with guest CRM data", async () => {
      vi.mocked(briefingService.getBriefing).mockResolvedValueOnce({
        success: true,
        data: mockBriefingResponse,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/briefing?venueId=venue-1",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      const res = body.reservations[0];
      expect(res.guest.visitCount).toBe(4);
      expect(res.guest.lastVisit).toBe("2026-04-01T19:00:00.000Z");
      expect(res.guest.staffNotes).toHaveLength(1);
      expect(res.guest.tags).toEqual(["VIP"]);
    });
  });
});
