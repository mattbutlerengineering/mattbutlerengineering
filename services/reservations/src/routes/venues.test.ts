import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the venue service
vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    listForMember: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
    getPublicBySlug: vi.fn(),
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

// Mock the table-status service (GET /:id/table-statuses)
vi.mock("../services/table-status.js", () => ({
  tableStatusService: {
    getSnapshot: vi.fn(),
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

import { venueService, venueGroupService } from "../services/venue.js";
import { tableStatusService } from "../services/table-status.js";
import { jwtVerify } from "jose";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";

const mockVenueGroup = {
  id: "group-123",
  name: "Downtown Restaurant Group",
  slug: "downtown-restaurant-group",
  settings: null,
  createdAt: "2026-01-25T00:00:00.000Z",
};

const mockVenue = {
  id: "venue-123",
  venueGroupId: "group-123",
  venueGroup: mockVenueGroup,
  name: "Chez Panisse",
  slug: "chez-panisse",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

// Curated public projection returned by GET /v1/venues/by-slug/:slug (#4022) —
// deliberately excludes venueGroup/venueGroupId, settings, and timestamps.
const mockPublicVenue = {
  id: "venue-123",
  name: "Chez Panisse",
  slug: "chez-panisse",
  operatingHours: null,
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

describe("Venue Routes", () => {
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

  describe("Venue Group Endpoints", () => {
    describe("GET /v1/venues/groups", () => {
      it("returns paginated list of venue groups", async () => {
        vi.mocked(venueGroupService.list).mockResolvedValueOnce({
          data: [mockVenueGroup],
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
          url: "/api/v1/venues/groups",
          headers: { "x-auth-bypass": "true" },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].name).toBe("Downtown Restaurant Group");
        expect(body.pagination.total).toBe(1);
      });
    });

    describe("GET /v1/venues/groups/:id", () => {
      it("returns venue group by ID", async () => {
        vi.mocked(venueGroupService.getById).mockResolvedValueOnce(mockVenueGroup);

        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/groups/group-123",
          headers: { "x-auth-bypass": "true" },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.id).toBe("group-123");
        expect(body.data.slug).toBe("downtown-restaurant-group");
      });

      it("returns 404 when venue group not found", async () => {
        vi.mocked(venueGroupService.getById).mockResolvedValueOnce(null);

        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/groups/nonexistent",
          headers: { "x-auth-bypass": "true" },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.title).toBe("Not Found");
      });
    });

    describe("auth enforcement on reads (#3103)", () => {
      it("returns 401 for anonymous GET /v1/venues/groups", async () => {
        const response = await app.inject({ method: "GET", url: "/api/v1/venues/groups" });

        expect(response.statusCode).toBe(401);
      });

      it("returns 401 for anonymous GET /v1/venues/groups/:id", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/groups/group-123",
        });

        expect(response.statusCode).toBe(401);
      });

      it("allows authenticated operator to GET /v1/venues/groups", async () => {
        vi.mocked(venueGroupService.list).mockResolvedValueOnce({
          data: [mockVenueGroup],
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
          url: "/api/v1/venues/groups",
          headers: { "x-auth-bypass": "true" },
        });

        expect(response.statusCode).toBe(200);
      });

      it("allows authenticated operator to GET /v1/venues/groups/:id", async () => {
        vi.mocked(venueGroupService.getById).mockResolvedValueOnce(mockVenueGroup);

        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/groups/group-123",
          headers: { "x-auth-bypass": "true" },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe("POST /v1/venues/groups", () => {
      it("creates a new venue group with valid auth", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueGroupService.create).mockResolvedValueOnce(mockVenueGroup);

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/venues/groups",
          headers: {
            "x-auth-bypass": "true",
          },
          payload: {
            name: "Downtown Restaurant Group",
            slug: "downtown-restaurant-group",
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.data.name).toBe("Downtown Restaurant Group");
      });

      it("returns 400 when slug is already taken (Unique constraint)", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueGroupService.create).mockRejectedValueOnce(
          new Error("Unique constraint failed on the fields: (`slug`)")
        );

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/venues/groups",
          headers: { "x-auth-bypass": "true" },
          payload: {
            name: "Downtown Restaurant Group",
            slug: "downtown-restaurant-group",
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.title).toBe("Bad Request");
      });

      it("re-throws non-unique-constraint errors from venue group create", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueGroupService.create).mockRejectedValueOnce(new Error("Unexpected DB error"));

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/venues/groups",
          headers: { "x-auth-bypass": "true" },
          payload: {
            name: "Downtown Restaurant Group",
            slug: "downtown-restaurant-group",
          },
        });

        expect(response.statusCode).toBe(500);
      });

      it("returns 401 without auth", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/venues/groups",
          payload: {
            name: "Downtown Restaurant Group",
            slug: "downtown-restaurant-group",
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe("PATCH /v1/venues/groups/:id", () => {
      it("updates venue group with valid auth", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        const updatedGroup = { ...mockVenueGroup, name: "Updated Group" };
        vi.mocked(venueGroupService.update).mockResolvedValueOnce(updatedGroup);

        const response = await app.inject({
          method: "PATCH",
          url: "/api/v1/venues/groups/group-123",
          headers: {
            "x-auth-bypass": "true",
          },
          payload: {
            name: "Updated Group",
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.name).toBe("Updated Group");
      });

      it("returns 404 when updating nonexistent group", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueGroupService.update).mockResolvedValueOnce(null);

        const response = await app.inject({
          method: "PATCH",
          url: "/api/v1/venues/groups/nonexistent",
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

    describe("DELETE /v1/venues/groups/:id", () => {
      it("deletes venue group and returns 204 with valid auth", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueGroupService.delete).mockResolvedValueOnce(true);

        const response = await app.inject({
          method: "DELETE",
          url: "/api/v1/venues/groups/group-123",
          headers: {
            "x-auth-bypass": "true",
          },
        });

        expect(response.statusCode).toBe(204);
        expect(venueGroupService.delete).toHaveBeenCalledWith("group-123");
      });

      it("returns 404 when deleting nonexistent group", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueGroupService.delete).mockResolvedValueOnce(false);

        const response = await app.inject({
          method: "DELETE",
          url: "/api/v1/venues/groups/nonexistent",
          headers: {
            "x-auth-bypass": "true",
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  describe("Venue Endpoints", () => {
    describe("GET /v1/venues", () => {
      it("returns all venues for a platform admin (bypass identity is admin)", async () => {
        vi.mocked(venueService.list).mockResolvedValueOnce({
          data: [mockVenue],
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
          url: "/api/v1/venues",
          headers: { "x-auth-bypass": "true" },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].name).toBe("Chez Panisse");
        expect(body.pagination.total).toBe(1);
        expect(venueService.list).toHaveBeenCalled();
        expect(venueService.listForMember).not.toHaveBeenCalled();
      });

      it("filters by venueGroupId for admins", async () => {
        vi.mocked(venueService.list).mockResolvedValueOnce({
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
          url: "/api/v1/venues?venueGroupId=group-123",
          headers: { "x-auth-bypass": "true" },
        });

        expect(venueService.list).toHaveBeenCalledWith(1, 10, "group-123");
      });

      it("returns 401 for an anonymous caller", async () => {
        const response = await app.inject({ method: "GET", url: "/api/v1/venues" });

        expect(response.statusCode).toBe(401);
        expect(venueService.list).not.toHaveBeenCalled();
        expect(venueService.listForMember).not.toHaveBeenCalled();
      });

      it("scopes the list to a non-admin operator's own memberships (#3069)", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.listForMember).mockResolvedValueOnce({
          data: [mockVenue],
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
          url: "/api/v1/venues",
          headers: { authorization: "Bearer valid-token" },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        // A non-admin must never receive the unscoped venue list.
        expect(venueService.list).not.toHaveBeenCalled();
        expect(venueService.listForMember).toHaveBeenCalledWith("auth0|user-123", 1, 10, undefined);
      });

      it("passes venueGroupId through the membership-scoped query", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.listForMember).mockResolvedValueOnce({
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
          url: "/api/v1/venues?venueGroupId=group-123",
          headers: { authorization: "Bearer valid-token" },
        });

        expect(venueService.listForMember).toHaveBeenCalledWith(
          "auth0|user-123",
          1,
          10,
          "group-123"
        );
      });
    });

    describe("GET /v1/venues/:id", () => {
      it("returns venue by ID", async () => {
        vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);

        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/venue-123",
          headers: { "x-auth-bypass": "true" },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.id).toBe("venue-123");
        expect(body.data.name).toBe("Chez Panisse");
      });

      it("returns 404 when venue not found", async () => {
        vi.mocked(venueService.getById).mockResolvedValueOnce(null);

        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/nonexistent",
          headers: { "x-auth-bypass": "true" },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.title).toBe("Not Found");
      });

      it("returns 401 for an anonymous caller (#4017)", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/venue-123",
        });

        expect(response.statusCode).toBe(401);
        expect(venueService.getById).not.toHaveBeenCalled();
      });

      it("returns 403 when the caller has no access to the venue (#4017)", async () => {
        process.env = {
          ...originalEnv,
          AUTH_AUTHORITY: "https://test.auth0.com",
          AUTH_AUDIENCE: "https://api.example.com",
        };
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: { ...mockJWTPayload, sub: "auth0|outsider", permissions: [] },
          protectedHeader: { alg: "RS256" },
        } as never);
        const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(false);
        const scopedApp = await buildApp({ logger: false, venueMembershipLookup: lookup });
        await scopedApp.ready();

        const response = await scopedApp.inject({
          method: "GET",
          url: "/api/v1/venues/venue-123",
          headers: { authorization: "Bearer outsider-token" },
        });

        expect(response.statusCode).toBe(403);
        expect(venueService.getById).not.toHaveBeenCalled();

        await scopedApp.close();
        process.env = originalEnv;
      });
    });

    describe("GET /v1/venues/:id/table-statuses (#3931)", () => {
      it("returns the venue's current table-status snapshot", async () => {
        vi.mocked(tableStatusService.getSnapshot).mockResolvedValueOnce([
          { tableId: "table-1", status: "seated" },
          { tableId: "table-2", status: "available" },
        ]);

        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/venue-123/table-statuses",
          headers: { "x-auth-bypass": "true" },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toEqual([
          { tableId: "table-1", status: "seated" },
          { tableId: "table-2", status: "available" },
        ]);
        expect(tableStatusService.getSnapshot).toHaveBeenCalledWith("venue-123");
      });

      it("returns 401 for an anonymous caller", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/venue-123/table-statuses",
        });

        expect(response.statusCode).toBe(401);
        expect(tableStatusService.getSnapshot).not.toHaveBeenCalled();
      });

      it("returns 403 when the caller has no access to the venue", async () => {
        process.env = {
          ...originalEnv,
          AUTH_AUTHORITY: "https://test.auth0.com",
          AUTH_AUDIENCE: "https://api.example.com",
        };
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: { ...mockJWTPayload, sub: "auth0|outsider", permissions: [] },
          protectedHeader: { alg: "RS256" },
        } as never);
        const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(false);
        const scopedApp = await buildApp({ logger: false, venueMembershipLookup: lookup });
        await scopedApp.ready();

        const response = await scopedApp.inject({
          method: "GET",
          url: "/api/v1/venues/venue-123/table-statuses",
          headers: { authorization: "Bearer outsider-token" },
        });

        expect(response.statusCode).toBe(403);
        expect(tableStatusService.getSnapshot).not.toHaveBeenCalled();

        await scopedApp.close();
        process.env = originalEnv;
      });
    });

    describe("GET /v1/venues/by-slug/:slug", () => {
      it("returns the curated public venue projection by slug", async () => {
        vi.mocked(venueService.getPublicBySlug).mockResolvedValueOnce(mockPublicVenue);

        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/by-slug/chez-panisse",
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toEqual(mockPublicVenue);
        expect(venueService.getPublicBySlug).toHaveBeenCalledWith("chez-panisse");
      });

      it("excludes venueGroup, venueGroupId, and the raw settings blob (#4022)", async () => {
        vi.mocked(venueService.getPublicBySlug).mockResolvedValueOnce(mockPublicVenue);

        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/by-slug/chez-panisse",
        });

        const body = JSON.parse(response.body);
        expect(body.data).not.toHaveProperty("venueGroup");
        expect(body.data).not.toHaveProperty("venueGroupId");
        expect(body.data).not.toHaveProperty("settings");
        expect(body.data).not.toHaveProperty("createdAt");
        expect(body.data).not.toHaveProperty("updatedAt");
        expect(Object.keys(body.data).sort()).toEqual(["id", "name", "operatingHours", "slug"]);
      });

      it("does not call the internal, unprojected getBySlug", async () => {
        vi.mocked(venueService.getPublicBySlug).mockResolvedValueOnce(mockPublicVenue);

        await app.inject({
          method: "GET",
          url: "/api/v1/venues/by-slug/chez-panisse",
        });

        expect(venueService.getBySlug).not.toHaveBeenCalled();
      });

      it("returns 404 when venue slug not found", async () => {
        vi.mocked(venueService.getPublicBySlug).mockResolvedValueOnce(null);

        const response = await app.inject({
          method: "GET",
          url: "/api/v1/venues/by-slug/nonexistent",
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe("POST /v1/venues", () => {
      it("creates a new venue with valid auth", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.create).mockResolvedValueOnce(mockVenue);

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/venues",
          headers: {
            "x-auth-bypass": "true",
          },
          payload: {
            name: "Chez Panisse",
            slug: "chez-panisse",
            ianaTimezone: "America/Los_Angeles",
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.data.name).toBe("Chez Panisse");
        expect(body.data.ianaTimezone).toBe("America/Los_Angeles");
      });

      it("seeds the creating operator as the venue owner (#3069)", async () => {
        vi.mocked(venueService.create).mockResolvedValueOnce(mockVenue);

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/venues",
          headers: { "x-auth-bypass": "true" },
          payload: {
            name: "Chez Panisse",
            slug: "chez-panisse",
            ianaTimezone: "America/Los_Angeles",
          },
        });

        expect(response.statusCode).toBe(201);
        // The creator's Auth0 sub is threaded into create() so an owner
        // VenueMembership is seeded and the new venue appears in their scoped list.
        expect(venueService.create).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Chez Panisse", slug: "chez-panisse" }),
          "auth0|user-123"
        );
      });

      it("returns 400 when venue slug is already taken (Unique constraint)", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.create).mockRejectedValueOnce(
          new Error("Unique constraint failed on the fields: (`slug`)")
        );

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/venues",
          headers: { "x-auth-bypass": "true" },
          payload: {
            name: "Chez Panisse",
            slug: "chez-panisse",
            ianaTimezone: "America/Los_Angeles",
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.title).toBe("Bad Request");
      });

      it("re-throws non-unique-constraint errors from venue create", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.create).mockRejectedValueOnce(new Error("Unexpected DB error"));

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/venues",
          headers: { "x-auth-bypass": "true" },
          payload: {
            name: "Chez Panisse",
            slug: "chez-panisse",
            ianaTimezone: "America/Los_Angeles",
          },
        });

        expect(response.statusCode).toBe(500);
      });

      it("returns 401 without auth", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/venues",
          payload: {
            name: "Chez Panisse",
            slug: "chez-panisse",
            ianaTimezone: "America/Los_Angeles",
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe("PATCH /v1/venues/:id", () => {
      it("updates venue with valid auth", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        const updatedVenue = { ...mockVenue, name: "Updated Venue" };
        vi.mocked(venueService.update).mockResolvedValueOnce(updatedVenue);

        const response = await app.inject({
          method: "PATCH",
          url: "/api/v1/venues/venue-123",
          headers: {
            "x-auth-bypass": "true",
          },
          payload: {
            name: "Updated Venue",
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.name).toBe("Updated Venue");
      });

      it("returns 404 when updating nonexistent venue", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.update).mockResolvedValueOnce(null);

        const response = await app.inject({
          method: "PATCH",
          url: "/api/v1/venues/nonexistent",
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

    describe("DELETE /v1/venues/:id", () => {
      it("deletes venue and returns 204 with valid auth", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.delete).mockResolvedValueOnce("deleted");

        const response = await app.inject({
          method: "DELETE",
          url: "/api/v1/venues/venue-123",
          headers: {
            "x-auth-bypass": "true",
          },
        });

        expect(response.statusCode).toBe(204);
        expect(venueService.delete).toHaveBeenCalledWith("venue-123");
      });

      it("returns 404 when deleting nonexistent venue", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.delete).mockResolvedValueOnce("not_found");

        const response = await app.inject({
          method: "DELETE",
          url: "/api/v1/venues/nonexistent",
          headers: {
            "x-auth-bypass": "true",
          },
        });

        expect(response.statusCode).toBe(404);
      });

      it("returns 409 when the venue has dependent rows (Guest/FloorPlan/ReservationHold FK)", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.delete).mockResolvedValueOnce("has_dependents");

        const response = await app.inject({
          method: "DELETE",
          url: "/api/v1/venues/venue-with-guests",
          headers: {
            "x-auth-bypass": "true",
          },
        });

        expect(response.statusCode).toBe(409);
      });
    });
  });
});
