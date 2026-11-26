import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
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
  getAvailableDates: vi.fn(),
} as unknown as DomainServices["availabilityService"];

const lostDemandService = {
  recordNoSlotSearch: vi.fn().mockResolvedValue("recorded"),
} as unknown as DomainServices["lostDemandService"];

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});
// ADR-026 §3.3 item 3 / #5369 PR 8: see public-venues.test.ts's identical
// comment for why this is mocked rather than hitting real `$queryRaw`.
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue-1"),
}));
vi.mock("../services/member-token.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyMemberToken: vi.fn(),
}));
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { resolveVenueId } from "../services/resolve-venue.js";
import { verifyMemberToken } from "../services/member-token.js";

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
    app = await buildApp({
      logger: false,
      services: { venueService, availabilityService, lostDemandService },
    });
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

  describe("member early window (#9625)", () => {
    const URL = "/public/v1/venues/the-oak-table/availability?date=2026-06-15&partySize=4";
    const dayOptions = () =>
      vi.mocked(availabilityService.getDayAvailability).mock.calls.at(-1)?.[4];

    beforeEach(() => {
      vi.mocked(venueService.getBySlug).mockResolvedValue(mockVenue);
      vi.mocked(availabilityService.getDayAvailability).mockResolvedValue({ slots: [] });
      vi.mocked(verifyMemberToken).mockReset();
    });

    it("asks for the member window when the token verifies for this venue", async () => {
      vi.mocked(verifyMemberToken).mockResolvedValueOnce({
        valid: true,
        venueId: "venue_1",
        email: "ada@example.com",
      });

      const response = await app.inject({
        method: "GET",
        url: URL,
        headers: { "x-member-token": "t" },
      });

      expect(response.statusCode).toBe(200);
      expect(verifyMemberToken).toHaveBeenCalledWith("t");
      expect(dayOptions()).toMatchObject({ member: true });
    });

    it.each([
      ["no token", undefined, undefined],
      ["an invalid or revoked token", "t", { valid: false, expired: false }],
      ["an expired token", "t", { valid: false, expired: true }],
      ["a token for another venue", "t", { valid: true, venueId: "other", email: "a@b.co" }],
    ] as const)("serves the public window with %s", async (_label, token, verdict) => {
      if (verdict) vi.mocked(verifyMemberToken).mockResolvedValueOnce(verdict);

      const response = await app.inject({
        method: "GET",
        url: URL,
        headers: token ? { "x-member-token": token } : {},
      });

      expect(response.statusCode).toBe(200);
      expect(dayOptions()?.member).toBeFalsy();
    });

    it("asks for the member window on the dates listing too", async () => {
      vi.mocked(verifyMemberToken).mockResolvedValueOnce({
        valid: true,
        venueId: "venue_1",
        email: "ada@example.com",
      });
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValueOnce([]);

      await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak-table/availability/dates?from=2026-06-01&to=2026-06-30",
        headers: { "x-member-token": "t" },
      });

      expect(vi.mocked(availabilityService.getAvailableDates).mock.calls.at(-1)?.[4]).toMatchObject(
        { member: true }
      );
    });
  });

  describe("member status (#9627)", () => {
    const URL = "/public/v1/venues/the-oak-table/member";

    beforeEach(() => {
      vi.mocked(venueService.getBySlug).mockResolvedValue({
        ...mockVenue,
        settings: { ...mockVenue.settings, memberLeadDays: 14 },
      });
      vi.mocked(verifyMemberToken).mockReset();
    });

    it("reports the lead days for a token that verifies at this venue", async () => {
      vi.mocked(verifyMemberToken).mockResolvedValueOnce({
        valid: true,
        venueId: "venue_1",
        email: "ada@example.com",
      });

      const response = await app.inject({
        method: "GET",
        url: URL,
        headers: { "x-member-token": "t" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: { member: true, leadDays: 14 } });
    });

    it.each([
      ["no token", undefined, undefined],
      ["an invalid or revoked token", "t", { valid: false, expired: false }],
      ["an expired token", "t", { valid: false, expired: true }],
      ["a token for another venue", "t", { valid: true, venueId: "other", email: "a@b.co" }],
    ] as const)("says only member: false for %s", async (_label, token, verdict) => {
      if (verdict) vi.mocked(verifyMemberToken).mockResolvedValueOnce(verdict);

      const response = await app.inject({
        method: "GET",
        url: URL,
        headers: token ? { "x-member-token": token } : {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: { member: false, leadDays: 0 } });
    });
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

  describe("lost demand recording (#9484)", () => {
    const slot = (time: string, available: boolean) => ({ time, available, tables: [] });
    const search = (query: string, headers: Record<string, string> = {}) =>
      app.inject({
        method: "GET",
        url: `/public/v1/venues/the-oak-table/availability?${query}`,
        headers,
      });

    it("records a search with no slot at the requested time", async () => {
      vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.getDayAvailability).mockResolvedValueOnce({
        slots: [slot("2026-06-15T19:00:00", false), slot("2026-06-15T20:00:00", true)],
      });
      vi.mocked(lostDemandService.recordNoSlotSearch).mockClear();

      const response = await search("date=2026-06-15&partySize=4&time=19:00", {
        "x-session-id": "sess-1",
      });

      expect(response.statusCode).toBe(200);
      expect(lostDemandService.recordNoSlotSearch).toHaveBeenCalledWith(
        {
          venueId: "venue_1",
          date: "2026-06-15",
          requestedMinute: 19 * 60,
          partySize: 4,
          reason: "hours",
        },
        expect.objectContaining({ sessionId: "sess-1" }),
        expect.anything()
      );
    });

    it("records the whole-day miss with the any-time sentinel when no time was asked", async () => {
      vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.getDayAvailability).mockResolvedValueOnce({
        slots: [slot("2026-06-15T19:00:00", false)],
      });
      vi.mocked(lostDemandService.recordNoSlotSearch).mockClear();

      await search("date=2026-06-15&partySize=2");

      expect(lostDemandService.recordNoSlotSearch).toHaveBeenCalledWith(
        {
          venueId: "venue_1",
          date: "2026-06-15",
          requestedMinute: -1,
          partySize: 2,
          reason: "hours",
        },
        expect.anything(),
        expect.anything()
      );
    });

    it("does not record a search that has a slot at the requested time", async () => {
      vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.getDayAvailability).mockResolvedValueOnce({
        slots: [slot("2026-06-15T19:00:00", true)],
      });
      vi.mocked(lostDemandService.recordNoSlotSearch).mockClear();

      await search("date=2026-06-15&partySize=4&time=19:00");

      expect(lostDemandService.recordNoSlotSearch).not.toHaveBeenCalled();
    });

    it("does not record a closed or paused day", async () => {
      vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.getDayAvailability).mockResolvedValueOnce({
        slots: [],
        closure: { message: "Closed" },
      });
      vi.mocked(lostDemandService.recordNoSlotSearch).mockClear();

      await search("date=2026-12-24&partySize=2");

      expect(lostDemandService.recordNoSlotSearch).not.toHaveBeenCalled();
    });

    it("still answers 200 when the recorder throws or rejects", async () => {
      vi.mocked(venueService.getBySlug).mockResolvedValue(mockVenue);
      vi.mocked(availabilityService.getDayAvailability).mockResolvedValue({ slots: [] });

      vi.mocked(lostDemandService.recordNoSlotSearch).mockImplementationOnce(() => {
        throw new Error("sync boom");
      });
      expect((await search("date=2026-06-15&partySize=2")).statusCode).toBe(200);

      vi.mocked(lostDemandService.recordNoSlotSearch).mockRejectedValueOnce(new Error("boom"));
      expect((await search("date=2026-06-15&partySize=2")).statusCode).toBe(200);
    });
  });

  describe("GET /:slug/availability/dates", () => {
    it("lists only the closed dates, with their messages", async () => {
      vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValueOnce([
        { date: "2026-12-23", hasAvailability: true, slotCount: 8 },
        {
          date: "2026-12-24",
          hasAvailability: false,
          slotCount: 0,
          closure: { message: "Closed for a private event" },
        },
        { date: "2026-12-25", hasAvailability: false, slotCount: 0 },
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak-table/availability/dates?from=2026-12-23&to=2026-12-25",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [{ date: "2026-12-24", closure: { message: "Closed for a private event" } }],
      });
      expect(availabilityService.getAvailableDates).toHaveBeenCalledWith(
        "venue_1",
        "2026-12-23",
        "2026-12-25",
        2,
        expect.objectContaining({ logger: expect.anything() })
      );
    });

    it("returns 404 for an unknown venue", async () => {
      vi.mocked(resolveVenueId).mockResolvedValueOnce(null);
      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/fake/availability/dates?from=2026-12-23&to=2026-12-25",
      });
      expect(response.statusCode).toBe(404);
    });

    it("rejects a range that ends before it starts with a 400 problem", async () => {
      vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak-table/availability/dates?from=2026-12-25&to=2026-12-23",
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ status: 400 });
    });
  });
});

describe("public availability records the limiting reason (#9621)", () => {
  it("records pacing for a refused seating, and leaves demand out of the reply", async () => {
    const app = await buildApp({
      logger: false,
      services: { venueService, availabilityService, lostDemandService },
    });
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    await app.ready();
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(availabilityService.getDayAvailability).mockResolvedValueOnce({
      slots: [{ time: "2026-06-15T19:00:00", available: false, tables: [] }],
      demand: { hasSeatings: true, refusals: [{ minute: 19 * 60, reason: "pacing" }] },
    });
    vi.mocked(lostDemandService.recordNoSlotSearch).mockClear();

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/availability?date=2026-06-15&partySize=4&time=19:00",
    });

    expect(response.json()).not.toHaveProperty("demand");
    expect(lostDemandService.recordNoSlotSearch).toHaveBeenCalledWith(
      expect.objectContaining({ requestedMinute: 19 * 60, reason: "pacing" }),
      expect.anything(),
      expect.anything()
    );
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });
});
