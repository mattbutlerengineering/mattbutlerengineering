import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { Guest, Reservation } from "@mbe/types";
import type { BookingNotifier } from "../services/booking-notifications.js";
import { generateManageToken, verifyManageToken, secureCompareHex } from "./public-reservations.js";

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
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
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
vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { venueService } from "../services/venue.js";
import { confirmHold } from "../services/confirm-hold.js";
import { guestService } from "../services/guest.js";

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
  occasion: null,
  seatingPreference: null,
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

  it("returns 422 with PACING_EXCEEDED code when pacing is exceeded", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(confirmHold).mockResolvedValueOnce({
      success: false,
      error: "Pacing limit reached for this time slot",
      errorCode: "PACING_EXCEEDED",
    });

    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/reservations",
      payload: { holdId: "hold_1", guestName: "Jane", guestEmail: "jane@example.com" },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.title).toBe("Unprocessable Entity");
    expect(body.detail).toBe("Pacing limit reached for this time slot");
    // The machine-readable discriminator survives the AppError migration.
    expect(body.code).toBe("PACING_EXCEEDED");
  });

  it("returns 404 with VENUE_NOT_FOUND code for an unknown venue slug", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/does-not-exist/reservations",
      payload: { holdId: "hold_1", guestName: "Jane", guestEmail: "jane@example.com" },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.title).toBe("Not Found");
    expect(body.code).toBe("VENUE_NOT_FOUND");
    expect(body.detail).toContain("does-not-exist");
  });

  it("rejects an empty {} payload with 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/reservations",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a payload missing guestEmail with 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/reservations",
      payload: { holdId: "hold_1", guestName: "Jane" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects specialRequests exceeding 500 characters with 400", async () => {
    const tooLongRequests = "x".repeat(501);

    const response = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/reservations",
      payload: {
        holdId: "hold_1",
        guestName: "Jane Doe",
        guestEmail: "jane@example.com",
        specialRequests: tooLongRequests,
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("guest link on the public confirm (M5.2)", () => {
  const URL = "/public/v1/venues/the-oak-table/reservations";
  const knownContact = {
    holdId: "hold_1",
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: "+1555123456",
  };
  const emailGuest = { id: "gst_by_email", venueId: "venue_1", name: "Jane Doe" } as Guest;
  const phoneGuest = { id: "gst_by_phone", venueId: "venue_1", name: "J. Doe" } as Guest;
  /** What confirm-hold returns once the link is stored: the id plus the included relation. */
  const linkedReservation = {
    ...mockReservation,
    guestId: "gst_1",
    guest: { visitCount: 12, communicationPreference: "email_only" },
  };
  const unlinkedReservation = { ...mockReservation, guest: null };
  /** Headers a same-IP pair of injects may legitimately differ on. */
  const VOLATILE_HEADERS = [/^x-ratelimit-/, /^date$/];

  const stubNotifier: BookingNotifier = {
    scheduleBookingNotifications: vi.fn().mockResolvedValue(undefined),
    cancelBookingReminders: vi.fn().mockResolvedValue(undefined),
    rescheduleBookingReminders: vi.fn().mockResolvedValue(undefined),
    cancelBookingNotifications: vi.fn().mockResolvedValue(undefined),
  };
  let stubApp: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    stubApp = await buildApp({ logger: false, bookingNotifier: stubNotifier });
    await stubApp.ready();
  });

  afterAll(async () => {
    await stubApp.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  beforeEach(() => {
    vi.mocked(confirmHold).mockReset();
    vi.mocked(guestService.getById).mockReset();
    vi.mocked(guestService.findByEmail).mockReset().mockResolvedValue(null);
    vi.mocked(guestService.findByPhone).mockReset().mockResolvedValue(null);
    vi.mocked(stubNotifier.scheduleBookingNotifications).mockClear();
  });

  async function confirm(
    payload: Record<string, unknown>,
    reservation: Reservation = unlinkedReservation
  ) {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(confirmHold).mockResolvedValueOnce({ success: true, reservation });
    return stubApp.inject({ method: "POST", url: URL, payload });
  }

  const lastGuestDetails = () => vi.mocked(confirmHold).mock.calls.at(-1)?.[0].guestDetails;

  it("SC10: when email and phone match different guests, the email match is the link", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(emailGuest);
    vi.mocked(guestService.findByPhone).mockResolvedValue(phoneGuest);

    const response = await confirm(knownContact, linkedReservation);

    expect(response.statusCode).toBe(201);
    expect(lastGuestDetails()?.guestId).toBe("gst_by_email");
  });

  it("SC10: a phone-only match links to the phone's guest", async () => {
    vi.mocked(guestService.findByPhone).mockResolvedValue(phoneGuest);

    const response = await confirm(knownContact, linkedReservation);

    expect(response.statusCode).toBe(201);
    expect(lastGuestDetails()?.guestId).toBe("gst_by_phone");
  });

  it("SC10: no match passes no guestId to confirmHold", async () => {
    const response = await confirm(knownContact);

    expect(response.statusCode).toBe(201);
    expect(lastGuestDetails()?.guestId).toBeUndefined();
  });

  it("SC11: both lookups run for a matched and an unknown contact alike, decided by input", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(emailGuest);
    await confirm(knownContact, linkedReservation);
    expect(guestService.findByEmail).toHaveBeenCalledTimes(1);
    expect(guestService.findByEmail).toHaveBeenCalledWith("venue_1", "jane@example.com");
    expect(guestService.findByPhone).toHaveBeenCalledTimes(1);
    expect(guestService.findByPhone).toHaveBeenCalledWith("venue_1", "+1555123456");

    vi.mocked(guestService.findByEmail).mockResolvedValue(null);
    await confirm(knownContact);
    expect(guestService.findByEmail).toHaveBeenCalledTimes(2);
    expect(guestService.findByPhone).toHaveBeenCalledTimes(2);
  });

  it("SC11: the 201 is identical matched or unknown, while the notifier still sees the link", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(emailGuest);
    const matched = await confirm(knownContact, linkedReservation);
    const matchedNotified = vi.mocked(stubNotifier.scheduleBookingNotifications).mock.calls.at(-1);

    vi.mocked(guestService.findByEmail).mockResolvedValue(null);
    const unknown = await confirm(knownContact);
    const unknownNotified = vi.mocked(stubNotifier.scheduleBookingNotifications).mock.calls.at(-1);

    expect(matched.statusCode).toBe(201);
    expect(unknown.statusCode).toBe(201);

    // Which headers actually differ between the two injects — only rate-limit counters may.
    const differing = Object.keys({ ...matched.headers, ...unknown.headers }).filter(
      (name) => matched.headers[name] !== unknown.headers[name]
    );
    for (const name of differing) {
      expect(
        VOLATILE_HEADERS.some((pattern) => pattern.test(name)),
        name
      ).toBe(true);
    }
    const stable = (headers: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(headers).filter(([name]) => !VOLATILE_HEADERS.some((p) => p.test(name)))
      );
    expect(stable(unknown.headers)).toStrictEqual(stable(matched.headers));
    expect(unknown.headers["content-length"]).toBe(matched.headers["content-length"]);

    const normalise = (body: {
      data: { reservation: Record<string, unknown>; manageToken: string };
    }) => ({
      data: {
        reservation: {
          ...body.data.reservation,
          id: "<id>",
          createdAt: "<createdAt>",
          updatedAt: "<updatedAt>",
        },
        manageToken: "<manageToken>",
      },
    });
    expect(normalise(unknown.json())).toStrictEqual(normalise(matched.json()));

    for (const response of [matched, unknown]) {
      const { reservation } = response.json().data;
      expect(reservation.guestId).toBeNull();
      expect(reservation.guest).toBeNull();
    }
    expect(matchedNotified?.[0]).toMatchObject({ guestId: "gst_1" });
    expect(matchedNotified?.[0].guest).toEqual({
      visitCount: 12,
      communicationPreference: "email_only",
    });
    expect(unknownNotified?.[0]).toMatchObject({ guestId: null });
  });

  it("SC12: a guestId in the public body is never read", async () => {
    vi.mocked(guestService.getById).mockResolvedValue({
      id: "gst_evil",
      venueId: "venue_1",
    } as Guest);

    const response = await confirm({ ...knownContact, guestId: "gst_evil" });

    expect([201, 400]).toContain(response.statusCode);
    expect(guestService.getById).not.toHaveBeenCalled();
    for (const [args] of vi.mocked(confirmHold).mock.calls) {
      expect(args.guestDetails.guestId).not.toBe("gst_evil");
    }
  });
});

describe("bookingNotifier injection", () => {
  it("calls injected bookingNotifier.scheduleBookingNotifications with reservation and manage token", async () => {
    const stubNotifier: BookingNotifier = {
      scheduleBookingNotifications: vi.fn().mockResolvedValue(undefined),
      cancelBookingReminders: vi.fn().mockResolvedValue(undefined),
      rescheduleBookingReminders: vi.fn().mockResolvedValue(undefined),
      cancelBookingNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const stubApp = await buildApp({ logger: false, bookingNotifier: stubNotifier });
    await stubApp.ready();

    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(confirmHold).mockResolvedValueOnce({
      success: true,
      reservation: mockReservation,
    });

    const response = await stubApp.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/reservations",
      payload: { holdId: "hold_1", guestName: "Jane Doe", guestEmail: "jane@example.com" },
    });

    expect(response.statusCode).toBe(201);
    const { manageToken } = response.json().data;
    expect(stubNotifier.scheduleBookingNotifications).toHaveBeenCalledWith(
      mockReservation,
      manageToken
    );

    await stubApp.close();
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

  it("verifies a token for an email address that contains colons", () => {
    const email = "user:admin@example.com";
    const token = generateManageToken("res_456", email);
    const result = verifyManageToken(token);

    expect(result.valid).toBe(true);
    expect(result.reservationId).toBe("res_456");
    expect(result.guestEmail).toBe(email);
  });
});

describe("secureCompareHex", () => {
  it("uses a constant-time comparison for equal-length hex strings", () => {
    expect(secureCompareHex("deadbeef", "deadbeef")).toBe(true);
    expect(secureCompareHex("deadbeef", "deadbeee")).toBe(false);
  });

  it("returns false for mismatched-length signatures without throwing", () => {
    expect(() => secureCompareHex("ab", "abcd")).not.toThrow();
    expect(secureCompareHex("ab", "abcd")).toBe(false);
  });
});
