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

vi.mock("../services/manage-rebook.js", () => ({
  loadVenueCancellation: vi.fn().mockResolvedValue(null),
}));

vi.mock("../services/guest-signal.js", () => ({
  countGuestSignals: vi.fn().mockResolvedValue({ late: 0, arrived: 0 }),
}));

import { countGuestSignals } from "../services/guest-signal.js";

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

describe("GET /public/v1/reservations/manage (night-of venue fields)", () => {
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

  it("exposes the venue's public address and tonight note for the night-of page", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce({
      ...mockVenue,
      settings: {
        tonightNote: "  Patio's open, dress warm  ",
        profile: {
          address: {
            line1: "1 Oak St",
            city: "Portland",
            region: "OR",
            postalCode: "97201",
            country: "US",
          },
          website: "https://oak.example",
        },
        guestModificationCutoffHours: 2,
        depositSecret: "nope",
      },
    } as never);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    const venue = response.json().data.venue;
    expect(venue.address).toEqual({
      line1: "1 Oak St",
      city: "Portland",
      region: "OR",
      postalCode: "97201",
      country: "US",
    });
    expect(venue.tonightNote).toBe("Patio's open, dress warm");
    expect(JSON.stringify(venue)).not.toContain("nope");
    expect(JSON.stringify(venue)).not.toContain("oak.example");
  });

  it("reports how many signals the reservation has already sent, so the page can disable capped buttons", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...mockReservation,
      status: "CONFIRMED",
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(countGuestSignals).mockResolvedValueOnce({ late: 2, arrived: 1 });

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.json().data.guestSignals).toEqual({ late: 2, arrived: 1 });
    expect(countGuestSignals).toHaveBeenCalledWith("res_1");
  });

  it("reports zero signals without reading the history for a booking that cannot signal", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    vi.mocked(countGuestSignals).mockClear();
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.json().data.guestSignals).toEqual({ late: 0, arrived: 0 });
    expect(countGuestSignals).not.toHaveBeenCalled();
  });
});
