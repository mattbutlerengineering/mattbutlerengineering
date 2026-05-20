import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken, verifyManageToken } from "./public-reservations.js";

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
  holdService: { create: vi.fn(), release: vi.fn(), getById: vi.fn(), maybeCleanup: vi.fn() },
}));
vi.mock("../services/confirm-hold.js", () => ({
  confirmHold: vi.fn(),
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
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
  getPoolMetrics: vi.fn().mockReturnValue({
    active: 1, idle: 4, busy: 1, size: 5, utilization: 0.2, isDegraded: false,
  }),
}));
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { venueService } from "../services/venue.js";
import { confirmHold } from "../services/confirm-hold.js";

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

const mockReservation = {
  id: "res_1",
  date: "2026-06-15",
  startTime: "19:00",
  endTime: "21:00",
  partySize: 4,
  status: "CONFIRMED" as const,
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+1555123456",
  guestId: null,
  userId: null,
  tableId: "table_1",
  venueId: "venue_1",
  createdAt: "2026-06-15T00:00:00Z",
  updatedAt: "2026-06-15T00:00:00Z",
};

describe("POST /public/v1/venues/:slug/reservations", () => {
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

  it("creates reservation from hold and returns 201 with manage token", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(confirmHold).mockResolvedValueOnce({
      success: true,
      reservation: mockReservation,
    });

    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/reservations",
      payload: { holdId: "hold_1", guestName: "Jane Doe", guestEmail: "jane@example.com" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.reservation.id).toBe("res_1");
    expect(body.data.reservation.status).toBe("CONFIRMED");
    expect(body.data.manageToken).toBeDefined();
  });

  it("returns 410 when hold is expired", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(confirmHold).mockResolvedValueOnce({
      success: false,
      error: "Hold expired",
      errorCode: "EXPIRED",
    });

    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/reservations",
      payload: { holdId: "hold_expired", guestName: "Jane", guestEmail: "jane@example.com" },
    });

    expect(response.statusCode).toBe(410);
  });

  it("returns 409 when hold confirmation fails for other reasons", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(confirmHold).mockResolvedValueOnce({
      success: false,
      error: "Table conflict",
      errorCode: "CONFLICT",
    });

    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/reservations",
      payload: { holdId: "hold_1", guestName: "Jane", guestEmail: "jane@example.com" },
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("manage token", () => {
  it("generates and verifies a valid token", () => {
    const token = generateManageToken("res_123", "jane@example.com");
    const result = verifyManageToken(token);

    expect(result.valid).toBe(true);
    expect(result.reservationId).toBe("res_123");
    expect(result.guestEmail).toBe("jane@example.com");
  });

  it("rejects tampered tokens", () => {
    const token = generateManageToken("res_123", "jane@example.com");
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(verifyManageToken(tampered).valid).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(verifyManageToken("not-a-token").valid).toBe(false);
    expect(verifyManageToken("").valid).toBe(false);
  });
});
