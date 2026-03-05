import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the floor plan service
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

// Mock the venue service (needed for app registration)
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

// Mock the table service (needed for app registration)
vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the reservation service (needed for app registration)
vi.mock("../services/reservation.js", () => ({
  reservationService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listByUserId: vi.fn(),
    cancel: vi.fn(),
  },
}));

// Mock the guest service (needed for app registration)
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

// Mock the database (needed for health check registration)
vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

// Mock jose library for JWT verification
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { floorPlanService } from "../services/floor-plan.js";
import { jwtVerify } from "jose";

const mockTable = {
  id: "table-123",
  name: "Table 1",
  tableNumber: "1",
  capacity: 4,
  minCovers: 1,
  maxCovers: 6,
  location: "Main Floor",
  isActive: true,
  priority: 0,
  venueId: "venue-123",
  floorPlanId: "floor-plan-123",
  shapeMetadata: {
    x: 100,
    y: 200,
    width: 80,
    height: 80,
    shape: "rectangle" as const,
  },
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

const mockFloorPlan = {
  id: "floor-plan-123",
  venueId: "venue-123",
  name: "Main Dining",
  isActive: true,
  layoutJson: {
    width: 1200,
    height: 800,
    gridSize: 20,
    showGrid: true,
  },
  tables: [mockTable],
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
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

describe("Floor Plan Routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  describe("GET /v1/floor-plans", () => {
    it("returns paginated list of floor plans", async () => {
      vi.mocked(floorPlanService.list).mockResolvedValueOnce({
        data: [mockFloorPlan],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/floor-plans",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Main Dining");
      expect(body.pagination.total).toBe(1);
    });

    it("filters by venueId", async () => {
      vi.mocked(floorPlanService.list).mockResolvedValueOnce({
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      await app.inject({
        method: "GET",
        url: "/api/v1/floor-plans?venueId=venue-123",
      });

      expect(floorPlanService.list).toHaveBeenCalledWith(1, 10, "venue-123");
    });
  });

  describe("GET /v1/floor-plans/:id", () => {
    it("returns floor plan by ID", async () => {
      vi.mocked(floorPlanService.getById).mockResolvedValueOnce(mockFloorPlan);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/floor-plans/floor-plan-123",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("floor-plan-123");
      expect(body.data.name).toBe("Main Dining");
      expect(body.data.tables).toHaveLength(1);
    });

    it("returns 404 when floor plan not found", async () => {
      vi.mocked(floorPlanService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/floor-plans/nonexistent",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("GET /v1/floor-plans/venue/:venueId/active", () => {
    it("returns active floor plan for venue", async () => {
      vi.mocked(floorPlanService.getActiveByVenueId).mockResolvedValueOnce(mockFloorPlan);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/floor-plans/venue/venue-123/active",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.isActive).toBe(true);
    });

    it("returns 404 when no active floor plan", async () => {
      vi.mocked(floorPlanService.getActiveByVenueId).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/floor-plans/venue/venue-123/active",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/floor-plans", () => {
    it("creates a new floor plan with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.create).mockResolvedValueOnce(mockFloorPlan);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          venueId: "venue-123",
          name: "Main Dining",
          layoutJson: {
            width: 1200,
            height: 800,
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe("Main Dining");
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans",
        payload: {
          venueId: "venue-123",
          name: "Main Dining",
          layoutJson: {
            width: 1200,
            height: 800,
          },
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("PATCH /v1/floor-plans/:id", () => {
    it("updates floor plan with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      const updatedFloorPlan = { ...mockFloorPlan, name: "Updated Dining" };
      vi.mocked(floorPlanService.update).mockResolvedValueOnce(updatedFloorPlan);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/floor-plans/floor-plan-123",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          name: "Updated Dining",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe("Updated Dining");
    });

    it("returns 404 when updating nonexistent floor plan", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.update).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/floor-plans/nonexistent",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          name: "New Name",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/floor-plans/:id/activate", () => {
    it("activates floor plan with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.setActive).mockResolvedValueOnce(mockFloorPlan);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans/floor-plan-123/activate",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          venueId: "venue-123",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(floorPlanService.setActive).toHaveBeenCalledWith(
        "floor-plan-123",
        "venue-123"
      );
    });

    it("returns 404 when activating nonexistent floor plan", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.setActive).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans/nonexistent/activate",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          venueId: "venue-123",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /v1/floor-plans/:id", () => {
    it("deletes floor plan and returns 204 with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.delete).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/floor-plans/floor-plan-123",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(floorPlanService.delete).toHaveBeenCalledWith("floor-plan-123");
    });

    it("returns 404 when deleting nonexistent floor plan", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.delete).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/floor-plans/nonexistent",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/floor-plans/tables/positions", () => {
    it("bulk updates table positions with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.bulkUpdateTablePositions).mockResolvedValueOnce([
        mockTable,
      ]);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans/tables/positions",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          floorPlanId: "floor-plan-123",
          positions: [
            {
              tableId: "table-123",
              shapeMetadata: {
                x: 150,
                y: 250,
                width: 80,
                height: 80,
                shape: "rectangle",
              },
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans/tables/positions",
        payload: {
          floorPlanId: "floor-plan-123",
          positions: [],
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /v1/floor-plans/tables/:tableId/assign", () => {
    it("assigns table to floor plan with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.assignTableToFloorPlan).mockResolvedValueOnce(
        mockTable
      );

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans/tables/table-123/assign",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          floorPlanId: "floor-plan-123",
          shapeMetadata: {
            x: 100,
            y: 200,
            width: 80,
            height: 80,
            shape: "rectangle",
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.floorPlanId).toBe("floor-plan-123");
    });

    it("returns 404 when table not found", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.assignTableToFloorPlan).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans/tables/nonexistent/assign",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          floorPlanId: "floor-plan-123",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/floor-plans/tables/:tableId/remove", () => {
    it("removes table from floor plan with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      const removedTable = { ...mockTable, floorPlanId: null, shapeMetadata: null };
      vi.mocked(floorPlanService.removeTableFromFloorPlan).mockResolvedValueOnce(
        removedTable
      );

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans/tables/table-123/remove",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.floorPlanId).toBeNull();
    });

    it("returns 404 when table not found", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(floorPlanService.removeTableFromFloorPlan).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/floor-plans/tables/nonexistent/remove",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
