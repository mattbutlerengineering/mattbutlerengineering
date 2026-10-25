import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { DomainServices } from "../services/domain-services.js";

// Domain services are injected via buildApp({ services }) (issue #6771), so the
// public availability route needs no vi.mock ring of service modules to register.
const venueService = {
  getBySlug: vi.fn(),
} as unknown as DomainServices["venueService"];
const availabilityService = {
  getDayAvailability: vi.fn(),
} as unknown as DomainServices["availabilityService"];

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});
// ADR-026 §3.3 item 3 / #5369 PR 8: see public-venues.test.ts's identical
// comment for why this is mocked rather than hitting real `$queryRaw`.
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue-1"),
}));
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { resolveVenueId } from "../services/resolve-venue.js";

const mockVenue = {
  id: "venue_1",
  venueGroupId: "group_1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
  operatingHours: { monday: { open: "11:00", close: "22:00" } },
  settings: { maxPartySize: 12 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("GET /public/v1/venues/:slug/availability", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false, services: { venueService, availabilityService } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  it("returns available time slots for a venue", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(availabilityService.getDayAvailability).mockResolvedValueOnce({
      slots: [
        {
          time: "2026-06-15T19:00:00",
          available: true,
          tables: [{ id: "t1", name: "Table 1", capacity: 4, minCovers: 1, maxCovers: 4 }],
        },
        { time: "2026-06-15T19:15:00", available: false, tables: [] },
        {
          time: "2026-06-15T19:30:00",
          available: true,
          tables: [{ id: "t2", name: "Table 2", capacity: 6, minCovers: 2, maxCovers: 6 }],
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/availability?date=2026-06-15&partySize=4",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      time: "2026-06-15T19:00:00",
      available: true,
      tables: [{ id: "t1", name: "Table 1", capacity: 4, minCovers: 1, maxCovers: 4 }],
    });
    expect(body).not.toHaveProperty("closure");
    expect(body).not.toHaveProperty("bookingPaused");
    expect(availabilityService.getDayAvailability).toHaveBeenCalledWith(
      "venue_1",
      "2026-06-15",
      4,
      undefined,
      expect.objectContaining({ logger: expect.anything() })
    );
  });

  it("returns the closure message for a closed date", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(availabilityService.getDayAvailability).mockResolvedValueOnce({
      slots: [],
      closure: { message: "Closed for a private event" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/availability?date=2026-12-24&partySize=2",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [],
      closure: { message: "Closed for a private event" },
    });
  });

  it("returns the booking pause with the phone to call", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(availabilityService.getDayAvailability).mockResolvedValueOnce({
      slots: [],
      bookingPaused: { message: "Online booking is paused right now.", phone: "(555) 123-4567" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/availability?date=2026-06-15&partySize=2",
    });

    expect(response.json()).toEqual({
      data: [],
      bookingPaused: { message: "Online booking is paused right now.", phone: "(555) 123-4567" },
    });
  });

  it("returns 404 for non-existent venue", async () => {
    vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/fake/availability?date=2026-06-15&partySize=4",
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns an RFC 7807 problem-details body for a 404 (ADR-008)", async () => {
    vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/fake/availability?date=2026-06-15&partySize=4",
    });

    const body = response.json();
    expect(body).toMatchObject({
      type: "about:blank",
      title: expect.any(String),
      status: 404,
    });
    expect(body.detail).toContain("fake");
    expect(body).not.toHaveProperty("success");
  });

  it("returns an RFC 7807 problem-details body for a 400 (ADR-008)", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/availability?date=2026-06-15&partySize=0",
    });

    const body = response.json();
    expect(body).toMatchObject({
      type: "about:blank",
      title: expect.any(String),
      status: 400,
    });
    expect(body).not.toHaveProperty("success");
  });

  it("returns empty array when no slots available", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(availabilityService.getDayAvailability).mockResolvedValueOnce({
      slots: [{ time: "2026-06-15T19:00:00", available: false, tables: [] }],
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/availability?date=2026-06-15&partySize=4",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(0);
  });
});
