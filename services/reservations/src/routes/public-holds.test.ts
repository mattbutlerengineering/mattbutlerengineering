import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

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
vi.mock("../services/hold.js", () => ({
  holdService: { create: vi.fn(), release: vi.fn(), confirm: vi.fn(), getById: vi.fn() },
}));
vi.mock("../services/availability.js", () => ({
  availabilityService: { getTimeSlots: vi.fn(), getDateAvailability: vi.fn() },
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
    bulkUpdatePositions: vi.fn(),
    assignTable: vi.fn(),
    removeTable: vi.fn(),
  },
}));
vi.mock("../services/database.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
}));
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { venueService } from "../services/venue.js";
import { holdService } from "../services/hold.js";
import { resetRateLimitState } from "../middleware/public-rate-limit.js";

const mockVenue = {
  id: "venue_1",
  venueGroupId: "group_1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mockHold = {
  id: "hold_1",
  venueId: "venue_1",
  tableId: "table_1",
  date: "2026-06-15",
  startTime: "2026-06-15T19:00:00Z",
  endTime: "2026-06-15T21:00:00Z",
  partySize: 4,
  sessionId: "sess_1",
  expiresAt: "2026-06-15T19:10:00Z",
  createdAt: "2026-06-15T18:50:00Z",
};

describe("POST /public/v1/venues/:slug/holds", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  beforeEach(() => {
    resetRateLimitState();
  });

  it("creates a hold and returns 201", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(holdService.create).mockResolvedValueOnce({ success: true, hold: mockHold });

    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/holds",
      payload: { date: "2026-06-15", startTime: "19:00", endTime: "21:00", partySize: 4 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.id).toBe("hold_1");
  });

  it("returns 409 when slot is unavailable", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(holdService.create).mockResolvedValueOnce({
      success: false,
      error: "No tables available",
    });

    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/holds",
      payload: { date: "2026-06-15", startTime: "19:00", endTime: "21:00", partySize: 4 },
    });

    expect(response.statusCode).toBe(409);
  });

  it("returns 404 for unknown venue", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/fake/holds",
      payload: { date: "2026-06-15", startTime: "19:00", endTime: "21:00", partySize: 4 },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("DELETE /public/v1/venues/:slug/holds/:holdId", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  it("releases a hold and returns 204", async () => {
    vi.mocked(holdService.release).mockResolvedValueOnce(true);

    const response = await app.inject({
      method: "DELETE",
      url: "/public/v1/venues/the-oak-table/holds/hold_1",
    });

    expect(response.statusCode).toBe(204);
  });
});
