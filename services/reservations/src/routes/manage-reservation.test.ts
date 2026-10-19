import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { DomainServices } from "../services/domain-services.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken } from "./public-reservations.js";

vi.mock("../notifications/index.js", () => {
  class MockResendNotificationAdapter {
    sendBookingConfirmation = vi.fn().mockResolvedValue(undefined);
    sendBookingReminder = vi.fn().mockResolvedValue(undefined);
    sendBookingModified = vi.fn().mockResolvedValue(undefined);
    sendBookingCancelled = vi.fn().mockResolvedValue(undefined);
  }
  class MockTwilioSmsAdapter {}
  class MockNotificationDispatcher {
    sendBookingConfirmation = vi.fn().mockResolvedValue(undefined);
    sendBookingReminder = vi.fn().mockResolvedValue(undefined);
    sendBookingModified = vi.fn().mockResolvedValue(undefined);
    sendBookingCancelled = vi.fn().mockResolvedValue(undefined);
  }
  return {
    ResendNotificationAdapter: MockResendNotificationAdapter,
    TwilioSmsAdapter: MockTwilioSmsAdapter,
    NotificationDispatcher: MockNotificationDispatcher,
  };
});

// Domain services are injected via buildApp({ services }) (issue #6772), so the
// migrated routes need no vi.mock of their service modules.
const reservationService = {
  getById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
} as unknown as DomainServices["reservationService"];

const venueService = {
  list: vi.fn(),
  getById: vi.fn(),
  getBySlug: vi.fn(),
} as unknown as DomainServices["venueService"];

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email_1" }) },
  })),
}));

// ADR-026 §3.3 item 4 / #5369 PR 8: `requireManageToken` and this route now
// resolve the reservation's venue via `resolveVenueId` — see
// public-venues.test.ts's identical comment. Resolves to `mockReservation
// .venueId`/`mockVenue.id` so both call sites' own service mocks stay in
// control of the actual test-case behavior.
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue_1"),
}));

import { resolveVenueId } from "../services/resolve-venue.js";

const mockReservation = {
  id: "res_1",
  venueId: "venue_1",
  date: "2026-06-15",
  startTime: "19:00",
  endTime: "21:00",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+1555000111",
  status: "PENDING",
  notes: "Window seat please",
  cancellationReason: null,
  cancellationNote: null,
  guestId: null,
  userId: null,
  tableId: "table_1",
  table: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const mockVenue = {
  id: "venue_1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  settings: { phone: "+15035551234" },
};

describe("GET /public/v1/reservations/manage", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false, services: { reservationService, venueService } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  it("resolves the venue and loads the reservation exactly once per request", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    vi.mocked(resolveVenueId).mockClear();
    vi.mocked(reservationService.getById).mockClear();
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.statusCode).toBe(200);
    expect(resolveVenueId).toHaveBeenCalledTimes(1);
    expect(reservationService.getById).toHaveBeenCalledTimes(1);
  });

  it("returns reservation + venue details for valid token", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    // the manage-token scope loads the reservation once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.reservation.id).toBe("res_1");
    expect(body.data.reservation.guestName).toBe("Jane Doe");
    expect(body.data.reservation.partySize).toBe(4);
    expect(body.data.venue.name).toBe("The Oak Table");
    expect(body.data.venue.phone).toBe("+15035551234");
  });

  it("omits venue.phone when the venue has no contact phone configured", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce({
      ...mockVenue,
      settings: {},
    } as never);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.venue.phone).toBeUndefined();
  });

  it("exposes the guest modification limits on venue, null when unset", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce({
      ...mockVenue,
      settings: { guestModificationCutoffHours: 24, guestMaxPartySizeChange: 2 },
    } as never);
    const configured = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });
    expect(configured.json().data.venue.modificationCutoffHours).toBe(24);
    expect(configured.json().data.venue.maxPartySizeChange).toBe(2);

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce({ ...mockVenue, settings: {} } as never);
    const unset = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });
    expect(unset.json().data.venue.modificationCutoffHours).toBeNull();
    expect(unset.json().data.venue.maxPartySizeChange).toBeNull();
  });

  it("returns 404 with a code extension when reservation not found", async () => {
    const token = generateManageToken("res_nonexistent", "jane@example.com");

    // the manage-token scope loads the reservation once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().title).toBe("Reservation Not Found");
    expect(response.json().code).toBe("RESERVATION_NOT_FOUND");
  });
});

describe("GET /public/v1/reservations/manage — rate limiting", () => {
  it("has rate limiting configured at 10 req/min", async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    const freshApp = await buildApp({
      logger: false,
      services: { reservationService, venueService },
    });
    await freshApp.ready();

    // Send 11 requests — the 11th should be rate-limited
    const responses = [];
    for (let i = 0; i < 11; i++) {
      const response = await freshApp.inject({
        method: "GET",
        url: "/public/v1/reservations/manage?token=garbage-token",
      });
      responses.push(response);
    }

    await freshApp.close();

    // First 10 return 401 (invalid token), 11th should be rate limited
    for (let i = 0; i < 10; i++) {
      const response = responses[i];
      if (!response) throw new Error(`expected response at index ${i}`);
      expect(response.statusCode).toBe(401);
    }
    const eleventh = responses[10];
    if (!eleventh) throw new Error("expected an 11th response");
    expect(eleventh.statusCode).toBe(429);
  });
});
