import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken } from "./public-reservations.js";

const { mockSendBookingCancelled } = vi.hoisted(() => ({
  mockSendBookingCancelled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@mbe/notifications", () => {
  class MockResendNotificationAdapter {
    sendBookingConfirmation = vi.fn().mockResolvedValue(undefined);
    sendBookingReminder = vi.fn().mockResolvedValue(undefined);
    sendBookingModified = vi.fn().mockResolvedValue(undefined);
    sendBookingCancelled = mockSendBookingCancelled;
  }
  return { ResendNotificationAdapter: MockResendNotificationAdapter };
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
  address: "123 Oak St, Portland OR",
};

describe("DELETE /public/v1/reservations/manage", () => {
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

  it("cancels reservation and returns 200 for valid token", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(
      mockReservation as never
    );
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...mockReservation,
      status: "CANCELLED",
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const response = await app.inject({
      method: "DELETE",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe("CANCELLED");
  });

  it("sends cancellation email with iCal METHOD:CANCEL", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(
      mockReservation as never
    );
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...mockReservation,
      status: "CANCELLED",
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    await app.inject({
      method: "DELETE",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(mockSendBookingCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res_1",
        guestEmail: "jane@example.com",
        venueName: "The Oak Table",
      })
    );
  });

  it("returns 409 when reservation is already cancelled", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...mockReservation,
      status: "CANCELLED",
    } as never);

    const response = await app.inject({
      method: "DELETE",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().detail).toContain("already cancelled");
  });

  it("returns 409 when reservation is completed", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...mockReservation,
      status: "COMPLETED",
    } as never);

    const response = await app.inject({
      method: "DELETE",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.statusCode).toBe(409);
  });

  it("returns 401 for invalid token", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/public/v1/reservations/manage?token=garbage-token",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 400 when token is missing", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/public/v1/reservations/manage",
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 404 when reservation not found", async () => {
    const token = generateManageToken("res_nonexistent", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: "DELETE",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.statusCode).toBe(404);
  });
});
