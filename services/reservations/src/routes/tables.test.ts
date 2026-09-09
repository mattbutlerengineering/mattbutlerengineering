import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { DomainServices } from "../services/domain-services.js";
import { ReservationEventEmitter } from "../services/events.js";
import { TableTransitionError } from "../services/table.js";
import { jwtVerify } from "jose";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";

// Domain services are injected via buildApp({ services }) (issue #3357), so the
// tables route no longer needs a vi.mock ring of sibling service modules to
// register the app. Only the service this route actually calls is faked.
const tableService = {
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  delete: vi.fn(),
} as unknown as DomainServices["tableService"];

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
  let stubEvents: ReservationEventEmitter;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    stubEvents = new ReservationEventEmitter();
    vi.spyOn(stubEvents, "emitTableUpdated");
    app = await buildApp({
      logger: false,
      reservationEvents: stubEvents,
      services: { tableService },
    });
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
        headers: { "x-auth-bypass": "true" },
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
        headers: { "x-auth-bypass": "true" },
      });

      expect(tableService.list).toHaveBeenCalledWith(2, 5, true, undefined);
    });

    it("passes venueId through to tableService.list (#4865)", async () => {
      vi.mocked(tableService.list).mockResolvedValueOnce({
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
        url: "/api/v1/tables?venueId=venue-1",
        headers: { "x-auth-bypass": "true" },
      });

      expect(tableService.list).toHaveBeenCalledWith(1, 10, false, "venue-1");
    });
  });

  describe("GET /v1/tables/:id", () => {
    it("returns table by ID", async () => {
      vi.mocked(tableService.getById).mockResolvedValueOnce(mockTable);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tables/table-123",
        headers: { "x-auth-bypass": "true" },
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
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Not Found");
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
      expect(stubEvents.emitTableUpdated).toHaveBeenCalledWith(occupiedTable);
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
      expect(body.title).toBe("Not Found");
    });

    it("returns 409 on invalid state transition", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(tableService.updateStatus).mockRejectedValueOnce(
        new TableTransitionError("AVAILABLE", "DIRTY", ["OCCUPIED"])
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

  describe("auth enforcement on reads (#3103)", () => {
    it("returns 401 for anonymous GET /v1/tables", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/tables" });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 for anonymous GET /v1/tables/:id", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/tables/table-123" });

      expect(response.statusCode).toBe(401);
    });

    it("allows authenticated operator to GET /v1/tables", async () => {
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
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("allows authenticated operator to GET /v1/tables/:id", async () => {
      vi.mocked(tableService.getById).mockResolvedValueOnce(mockTable);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tables/table-123",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});

// #4865 (Sentry HOSPITALITY-4/5): GET /v1/tables was gated on requireAdmin, so
// any venue-manager (non-admin, real venue membership) staff caller got a
// 403 — every prior test in this file authenticates through x-auth-bypass,
// which mints a hardcoded ADMIN identity, so the suite stayed green while the
// route was broken for every real operator. These tests authenticate through
// a real (mocked jose) JWT with an injected membership lookup instead — the
// same pattern used by guests.test.ts's "staff authorization" suite, as a
// separate top-level describe (its own env/app lifecycle, no interaction with
// the x-auth-bypass-based "Table Routes" suite above).
describe("Table Routes — venue-scoped staff authorization (#4865)", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    // Prior suites queue mockResolvedValueOnce payloads that the auth bypass
    // never consumes (jwtVerify is skipped under the bypass), so clear the
    // queue here to guarantee our real-JWT payloads are the ones returned.
    vi.mocked(jwtVerify).mockReset();
  });

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  async function buildAppWithMembership(lookup: VenueMembershipLookup): Promise<FastifyInstance> {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    const built = await buildApp({
      logger: false,
      services: { tableService },
      venueMembershipLookup: lookup,
    });
    await built.ready();
    return built;
  }

  it("returns 403 for a non-admin operator who is not a member of the requested venue", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { ...mockJWTPayload, sub: "auth0|operator-A", permissions: ["staff"] },
      protectedHeader: { alg: "RS256" },
    } as never);
    const lookup = vi
      .fn<VenueMembershipLookup>()
      .mockImplementation(async (_sub, venueId) => venueId === "venue-in-group-A");
    app = await buildAppWithMembership(lookup);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tables?venueId=venue-in-group-B",
      headers: { authorization: "Bearer operator-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(lookup).toHaveBeenCalledWith("auth0|operator-A", "venue-in-group-B");
    expect(tableService.list).not.toHaveBeenCalled();
  });

  it("allows a non-admin venue manager who is a member of the requested venue", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { ...mockJWTPayload, sub: "auth0|operator-A", permissions: ["staff"] },
      protectedHeader: { alg: "RS256" },
    } as never);
    const lookup = vi
      .fn<VenueMembershipLookup>()
      .mockImplementation(async (_sub, venueId) => venueId === "venue-in-group-A");
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
    app = await buildAppWithMembership(lookup);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tables?venueId=venue-in-group-A",
      headers: { authorization: "Bearer operator-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(tableService.list).toHaveBeenCalledWith(1, 10, false, "venue-in-group-A");
  });
});
