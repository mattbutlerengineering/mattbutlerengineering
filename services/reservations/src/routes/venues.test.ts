import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the venue service
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

import { venueService, venueGroupService } from "../services/venue.js";
import { jwtVerify } from "jose";

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
          url: "/v1/venues/groups",
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
          url: "/v1/venues/groups/group-123",
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
          url: "/v1/venues/groups/nonexistent",
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.error).toBe("Not Found");
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
          url: "/v1/venues/groups",
          headers: {
            authorization: "Bearer valid-token",
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

      it("returns 401 without auth", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/v1/venues/groups",
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
          url: "/v1/venues/groups/group-123",
          headers: {
            authorization: "Bearer valid-token",
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
          url: "/v1/venues/groups/nonexistent",
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

    describe("DELETE /v1/venues/groups/:id", () => {
      it("deletes venue group and returns 204 with valid auth", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueGroupService.delete).mockResolvedValueOnce(true);

        const response = await app.inject({
          method: "DELETE",
          url: "/v1/venues/groups/group-123",
          headers: {
            authorization: "Bearer valid-token",
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
          url: "/v1/venues/groups/nonexistent",
          headers: {
            authorization: "Bearer valid-token",
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  describe("Venue Endpoints", () => {
    describe("GET /v1/venues", () => {
      it("returns paginated list of venues", async () => {
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
          url: "/v1/venues",
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].name).toBe("Chez Panisse");
        expect(body.pagination.total).toBe(1);
      });

      it("filters by venueGroupId", async () => {
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
          url: "/v1/venues?venueGroupId=group-123",
        });

        expect(venueService.list).toHaveBeenCalledWith(1, 10, "group-123");
      });
    });

    describe("GET /v1/venues/:id", () => {
      it("returns venue by ID", async () => {
        vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);

        const response = await app.inject({
          method: "GET",
          url: "/v1/venues/venue-123",
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
          url: "/v1/venues/nonexistent",
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.error).toBe("Not Found");
      });
    });

    describe("GET /v1/venues/by-slug/:slug", () => {
      it("returns venue by slug", async () => {
        vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);

        const response = await app.inject({
          method: "GET",
          url: "/v1/venues/by-slug/chez-panisse",
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.slug).toBe("chez-panisse");
      });

      it("returns 404 when venue slug not found", async () => {
        vi.mocked(venueService.getBySlug).mockResolvedValueOnce(null);

        const response = await app.inject({
          method: "GET",
          url: "/v1/venues/by-slug/nonexistent",
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
          url: "/v1/venues",
          headers: {
            authorization: "Bearer valid-token",
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

      it("returns 401 without auth", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/v1/venues",
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
          url: "/v1/venues/venue-123",
          headers: {
            authorization: "Bearer valid-token",
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
          url: "/v1/venues/nonexistent",
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

    describe("DELETE /v1/venues/:id", () => {
      it("deletes venue and returns 204 with valid auth", async () => {
        vi.mocked(jwtVerify).mockResolvedValueOnce({
          payload: mockJWTPayload,
          protectedHeader: { alg: "RS256" },
        } as never);
        vi.mocked(venueService.delete).mockResolvedValueOnce(true);

        const response = await app.inject({
          method: "DELETE",
          url: "/v1/venues/venue-123",
          headers: {
            authorization: "Bearer valid-token",
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
        vi.mocked(venueService.delete).mockResolvedValueOnce(false);

        const response = await app.inject({
          method: "DELETE",
          url: "/v1/venues/nonexistent",
          headers: {
            authorization: "Bearer valid-token",
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });
});
