import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { createMockReservation, createMockJWTPayload } from "../test/mocks.js";

// Mock the briefing service
vi.mock("../services/briefing.js", () => ({
  briefingService: {
    getBriefing: vi.fn(),
  },
}));

// Mock all other services required by buildApp
vi.mock("../services/reservation.js", () => ({
  reservationService: {
    list: vi.fn(),
    listByUserId: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    createWithConflictCheck: vi.fn(),
    createWalkIn: vi.fn(),
    update: vi.fn(),
    updateWithConflictCheck: vi.fn(),
    cancel: vi.fn(),
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

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { briefingService } from "../services/briefing.js";
import { jwtVerify } from "jose";

const mockReservation = createMockReservation({ venueId: "venue-abc" });

const mockBriefingEntry = {
  ...mockReservation,
  guest: {
    id: "guest-1",
    name: "Jane Doe",
    visitCount: 5,
    lastVisit: "2026-06-01",
    dietaryRestrictions: ["gluten-free"],
    notes: "VIP guest",
    staffNotes: [{ text: "Prefers window seat", createdBy: "staff-1", createdAt: "2026-01-01" }],
    tags: ["VIP"],
    communicationPreference: "both" as const,
  },
};

describe("GET /api/v1/briefing", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;
  const mockJWTPayload = createMockJWTPayload();

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockJWTPayload,
      protectedHeader: { alg: "RS256" },
    } as never);
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  it("returns 401 when not authenticated", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19&venueId=venue-abc",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 400 when date param is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?venueId=venue-abc",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when venueId param is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns enriched reservations with guest data", async () => {
    vi.mocked(briefingService.getBriefing).mockResolvedValueOnce([mockBriefingEntry]);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19&venueId=venue-abc",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(mockReservation.id);
    expect(body.data[0].guest).toBeDefined();
    expect(body.data[0].guest.visitCount).toBe(5);
    expect(body.data[0].guest.dietaryRestrictions).toContain("gluten-free");
  });

  it("passes date and venueId to briefing service", async () => {
    vi.mocked(briefingService.getBriefing).mockResolvedValueOnce([]);

    await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19&venueId=venue-abc",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(briefingService.getBriefing).toHaveBeenCalledWith({
      date: "2026-06-19",
      venueId: "venue-abc",
    });
  });

  it("returns empty data array when no reservations", async () => {
    vi.mocked(briefingService.getBriefing).mockResolvedValueOnce([]);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19&venueId=venue-abc",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toEqual([]);
  });
});
