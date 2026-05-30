/**
 * TDD route tests for dietary restrictions on guests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

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
  prisma: { $queryRaw: vi.fn() },
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

import { guestService } from "../services/guest.js";

const mockGuestWithDietary = {
  id: "guest-123",
  venueId: "venue-123",
  email: "jane@example.com",
  phone: null,
  name: "Jane Doe",
  notes: null,
  visitCount: 0,
  lifetimeSpend: null,
  lastVisit: null,
  tags: null,
  communicationPreference: "both" as const,
  dietaryRestrictions: ["gluten-free", "vegan"],
  staffNotes: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Guest Routes — dietary restrictions", () => {
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
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  describe("POST /api/v1/guests — create with dietary restrictions", () => {
    it("accepts and returns dietaryRestrictions on create", async () => {
      vi.mocked(guestService.create).mockResolvedValueOnce(mockGuestWithDietary);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/guests",
        headers: { "x-auth-bypass": "true" },
        payload: {
          venueId: "venue-123",
          name: "Jane Doe",
          email: "jane@example.com",
          dietaryRestrictions: ["gluten-free", "vegan"],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.dietaryRestrictions).toEqual(["gluten-free", "vegan"]);
      expect(guestService.create).toHaveBeenCalledWith(
        expect.objectContaining({ dietaryRestrictions: ["gluten-free", "vegan"] })
      );
    });
  });

  describe("PATCH /api/v1/guests/:id — update dietary restrictions", () => {
    it("accepts and returns updated dietaryRestrictions", async () => {
      const updated = { ...mockGuestWithDietary, dietaryRestrictions: ["kosher"] };
      vi.mocked(guestService.update).mockResolvedValueOnce(updated);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/guests/guest-123",
        headers: { "x-auth-bypass": "true" },
        payload: { dietaryRestrictions: ["kosher"] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.dietaryRestrictions).toEqual(["kosher"]);
      expect(guestService.update).toHaveBeenCalledWith(
        "guest-123",
        expect.objectContaining({ dietaryRestrictions: ["kosher"] })
      );
    });

    it("clears dietaryRestrictions when sent as null", async () => {
      const updated = { ...mockGuestWithDietary, dietaryRestrictions: null };
      vi.mocked(guestService.update).mockResolvedValueOnce(updated);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/guests/guest-123",
        headers: { "x-auth-bypass": "true" },
        payload: { dietaryRestrictions: null },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.dietaryRestrictions).toBeNull();
    });
  });

  describe("GET /api/v1/guests/:id — returns dietaryRestrictions", () => {
    it("returns dietaryRestrictions in the guest response", async () => {
      vi.mocked(guestService.getById).mockResolvedValueOnce(mockGuestWithDietary);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/guests/guest-123",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.dietaryRestrictions).toEqual(["gluten-free", "vegan"]);
    });
  });

  describe("POST /api/v1/guests/find-or-create — passes dietaryRestrictions", () => {
    it("passes dietaryRestrictions to findOrCreate service", async () => {
      vi.mocked(guestService.findOrCreate).mockResolvedValueOnce(mockGuestWithDietary);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/guests/find-or-create",
        headers: { "x-auth-bypass": "true" },
        payload: {
          venueId: "venue-123",
          name: "Jane Doe",
          email: "jane@example.com",
          dietaryRestrictions: ["gluten-free"],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.dietaryRestrictions).toEqual(["gluten-free", "vegan"]);
      expect(guestService.findOrCreate).toHaveBeenCalledWith(
        "venue-123",
        expect.objectContaining({ dietaryRestrictions: ["gluten-free"] })
      );
    });
  });
});
