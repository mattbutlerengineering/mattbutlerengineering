import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the table service
vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
  TableTransitionError: class TableTransitionError extends Error {
    from: string;
    to: string;
    constructor(from: string, to: string) {
      super(`Invalid table transition: cannot transition from '${from}' to '${to}'`);
      this.name = "TableTransitionError";
      this.from = from;
      this.to = to;
    }
  },
}));

// Mock the events service
vi.mock("../services/events.js", () => ({
  emitTableUpdated: vi.fn(),
  emitReservationCreated: vi.fn(),
  emitReservationUpdated: vi.fn(),
  emitReservationCancelled: vi.fn(),
  emitHoldCreated: vi.fn(),
  emitHoldReleased: vi.fn(),
  emitHoldConfirmed: vi.fn(),
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

// Mock the floor plan service (needed for app registration)
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

// Mock the database (needed for health check registration)
vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// Mock jose library for JWT verification
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { tableService } from "../services/table.js";
import { emitTableUpdated } from "../services/events.js";
import { jwtVerify } from "jose";

const mockTable = {
  id: "table-123",
  name: "Table 1",
  tableNumber: "1",
  capacity: 4,
  minCovers: 1,
  maxCovers: null,
  location: "Main Floor",
  isActive: true,
  priority: 0,
  status: "AVAILABLE" as const,
  venueId: null,
  floorPlanId: null,
  shapeMetadata: null,
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

describe("Table Routes", () => {
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

  describe("GET /v1/tables", () => {
    it("returns paginated list of tables", async () => {
      vi.mocked(tableService.list).mockResolvedValueOnce({
        data: [mockTable],
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
        url: "/api/v1/tables",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Table 1");
      expect(body.pagination.total).toBe(1);
    });

    it("respects page, limit, and activeOnly query params", async () => {
      vi.mocked(tableService.list).mockResolvedValueOnce({
        data: [],
        pagination: {
          page: 2,
          limit: 5,
          total: 10,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        },
      });

      await app.inject({
        method: "GET",
        url: "/api/v1/tables?page=2&limit=5&activeOnly=true",
      });

      expect(tableService.list).toHaveBeenCalledWith(2, 5, true);
    });
  });

  describe("GET /v1/tables/:id", () => {
    it("returns table by ID", async () => {
      vi.mocked(tableService.getById).mockResolvedValueOnce(mockTable);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tables/table-123",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("table-123");
      expect(body.data.name).toBe("Table 1");
    });

    it("returns 404 when table not found", async () => {
      vi.mocked(tableService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tables/nonexistent",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
      // Regression for #1984: 4xx body must carry a non-undefined RFC 7807 `detail`
      expect(body.detail).toBe("Table not found");
    });
  });

  describe("POST /v1/tables", () => {
    it("creates a new table with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(tableService.create).mockResolvedValueOnce(mockTable);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tables",
        headers: {
          "x-auth-bypass": "true",
        },
        payload: {
          name: "Table 1",
          capacity: 4,
          location: "Main Floor",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe("Table 1");
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tables",
        payload: {
          name: "Table 1",
          capacity: 4,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("PATCH /v1/tables/:id", () => {
    it("updates table with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      const updatedTable = { ...mockTable, name: "Updated Table" };
      vi.mocked(tableService.update).mockResolvedValueOnce(updatedTable);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/tables/table-123",
        headers: {
          "x-auth-bypass": "true",
        },
        payload: {
          name: "Updated Table",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe("Updated Table");
    });

    it("returns 404 when updating nonexistent table", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(tableService.update).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/tables/nonexistent",
        headers: {
          "x-auth-bypass": "true",
        },
        payload: {
          name: "New Name",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PATCH /v1/tables/:id/status", () => {
    it("updates table status with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      const occupiedTable = { ...mockTable, status: "OCCUPIED" as const };
      vi.mocked(tableService.updateStatus).mockResolvedValueOnce(occupiedTable);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/tables/table-123/status",
        headers: {
          "x-auth-bypass": "true",
        },
        payload: {
          status: "OCCUPIED",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("OCCUPIED");
      expect(tableService.updateStatus).toHaveBeenCalledWith("table-123", "OCCUPIED");
      expect(emitTableUpdated).toHaveBeenCalledWith(occupiedTable);
    });

    it("returns 404 when table not found", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(tableService.updateStatus).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/tables/nonexistent/status",
        headers: {
          "x-auth-bypass": "true",
        },
        payload: {
          status: "DIRTY",
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });

    it("returns 409 on invalid state transition", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      const { TableTransitionError } = await import("../services/table.js");
      vi.mocked(tableService.updateStatus).mockRejectedValueOnce(
        new TableTransitionError("AVAILABLE", "DIRTY")
      );

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/tables/table-123/status",
        headers: {
          "x-auth-bypass": "true",
        },
        payload: {
          status: "DIRTY",
        },
      });

      expect(response.statusCode).toBe(409);
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/tables/table-123/status",
        payload: {
          status: "AVAILABLE",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 400 with invalid status", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/tables/table-123/status",
        headers: {
          "x-auth-bypass": "true",
        },
        payload: {
          status: "INVALID_STATUS",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /v1/tables/:id", () => {
    it("deletes table and returns 204 with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(tableService.delete).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/tables/table-123",
        headers: {
          "x-auth-bypass": "true",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(tableService.delete).toHaveBeenCalledWith("table-123");
    });

    it("returns 404 when deleting nonexistent table", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(tableService.delete).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/tables/nonexistent",
        headers: {
          "x-auth-bypass": "true",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
