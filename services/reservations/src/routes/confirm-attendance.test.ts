import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
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

const makePendingReservation = () => ({
  id: "res_1",
  venueId: "venue_1",
  date: "2026-06-15",
  startTime: "19:00",
  endTime: "21:00",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: null,
  status: "PENDING",
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  guestId: null,
  userId: null,
  tableId: "table_1",
  table: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
});

describe("PATCH /public/v1/reservations/confirm", () => {
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
    vi.clearAllMocks();
  });

  it("confirms PENDING reservation and returns HTML success", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    vi.mocked(reservationService.getById).mockResolvedValueOnce(makePendingReservation() as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...makePendingReservation(),
      status: "CONFIRMED",
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/confirm?token=${token}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("confirmed");
    expect(reservationService.update).toHaveBeenCalledWith("res_1", { status: "CONFIRMED" });
  });

  it("returns success for already-CONFIRMED reservation (idempotent)", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...makePendingReservation(),
      status: "CONFIRMED",
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/confirm?token=${token}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("confirmed");
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("returns 401 HTML for invalid token", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/public/v1/reservations/confirm?token=garbage",
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("returns 410 HTML for expired token", async () => {
    const { createHmac } = await import("crypto");
    const secret = process.env.MANAGE_TOKEN_SECRET || "dev-secret-do-not-use-in-prod";
    const expiry = Date.now() - 1000;
    const payload = `res_1:jane@example.com:${expiry}`;
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    const expiredToken = Buffer.from(`${payload}:${signature}`).toString("base64url");

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/confirm?token=${expiredToken}`,
    });

    expect(response.statusCode).toBe(410);
    expect(response.headers["content-type"]).toContain("text/html");
  });
});

describe("PATCH /public/v1/reservations/confirm — rate limiting", () => {
  it("has rate limiting configured at 10 req/min", async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    const freshApp = await buildApp({ logger: false });
    await freshApp.ready();

    // Send 11 requests — the 11th should be rate-limited
    const responses = [];
    for (let i = 0; i < 11; i++) {
      const response = await freshApp.inject({
        method: "PATCH",
        url: "/public/v1/reservations/confirm?token=garbage",
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
