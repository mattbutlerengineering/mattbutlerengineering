import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken } from "./public-reservations.js";

vi.mock("@mbe/notifications", () => {
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

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    getById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
  },
}));

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email_1" }) },
  })),
}));

import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";

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
};

describe("GET /public/v1/reservations/manage", () => {
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

  it("returns reservation + venue details for valid token", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

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
  });
});

describe("GET /public/v1/reservations/manage — rate limiting", () => {
  it("has rate limiting configured at 10 req/min", async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    const freshApp = await buildApp({ logger: false });
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
      expect(responses[i].statusCode).toBe(401);
    }
    expect(responses[10].statusCode).toBe(429);
  });
});
