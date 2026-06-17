import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken } from "./public-reservations.js";
import type { NotificationDispatcher } from "@mbe/notifications";
import type { BookingNotifier } from "../services/booking-notifications.js";

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    getById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    updateWithConflictCheck: vi.fn(),
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
  guest: { visitCount: 3, communicationPreference: "email_only" },
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

function createStubNotificationDispatcher(): Pick<
  NotificationDispatcher,
  | "sendBookingConfirmation"
  | "sendBookingReminder"
  | "sendBookingModified"
  | "sendBookingCancelled"
  | "sendWinBack"
> & {
  sendBookingConfirmation: ReturnType<typeof vi.fn>;
  sendBookingReminder: ReturnType<typeof vi.fn>;
  sendBookingModified: ReturnType<typeof vi.fn>;
  sendBookingCancelled: ReturnType<typeof vi.fn>;
  sendWinBack: ReturnType<typeof vi.fn>;
} {
  return {
    sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
    sendBookingReminder: vi.fn().mockResolvedValue(undefined),
    sendBookingModified: vi.fn().mockResolvedValue(undefined),
    sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
    sendWinBack: vi.fn().mockResolvedValue(undefined),
  };
}

describe("PATCH /public/v1/reservations/manage", () => {
  let app: FastifyInstance;
  let stubNotifications: ReturnType<typeof createStubNotificationDispatcher>;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    stubNotifications = createStubNotificationDispatcher();
    app = await buildApp({ logger: false, notificationPort: stubNotifications as never });
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  it("modifies reservation and returns 200 with updated data", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    const updatedReservation = {
      ...mockReservation,
      partySize: 6,
      startTime: "20:00",
    };

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updatedReservation,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { partySize: 6, startTime: "20:00" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.reservation.partySize).toBe(6);
    expect(body.data.reservation.startTime).toBe("20:00");
  });

  it("sends modified notification with guest communication preference", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    const updatedReservation = { ...mockReservation, partySize: 2 };

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updatedReservation,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { partySize: 2 },
    });

    expect(stubNotifications.sendBookingModified).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res_1",
        guestEmail: "jane@example.com",
        venueName: "The Oak Table",
        sequence: 2,
      }),
      "email_only"
    );
  });

  it("returns 409 when time slot has conflict", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: false,
      error: "Time slot has a conflict with an existing reservation or hold",
      conflict: { hasConflict: true },
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { startTime: "18:00" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().title).toBe("Slot Unavailable");
  });

  it("returns 409 for cancelled reservation", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...mockReservation,
      status: "CANCELLED",
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { partySize: 2 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().detail).toContain("cancelled");
  });

  it("returns 409 for completed reservation", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...mockReservation,
      status: "COMPLETED",
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { partySize: 2 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().detail).toContain("completed");
  });

  it("returns 400 when no fields provided", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().detail).toContain("At least one field");
  });

  it("returns 404 when reservation not found", async () => {
    const token = generateManageToken("res_nonexistent", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { partySize: 2 },
    });

    expect(response.statusCode).toBe(404);
  });

  it("allows modifying special requests only", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    const updatedReservation = {
      ...mockReservation,
      notes: "No peanuts please",
    };

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updatedReservation,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { specialRequests: "No peanuts please" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.reservation.notes).toBe("No peanuts please");
  });

  it("reschedules reminder jobs via injected bookingNotifier when time changes", async () => {
    const stubNotifier: BookingNotifier = {
      scheduleBookingNotifications: vi.fn().mockResolvedValue(undefined),
      cancelBookingReminders: vi.fn().mockResolvedValue(undefined),
      rescheduleBookingReminders: vi.fn().mockResolvedValue(undefined),
    };
    const stubApp = await buildApp({
      logger: false,
      notificationPort: createStubNotificationDispatcher() as never,
      bookingNotifier: stubNotifier,
    });
    await stubApp.ready();

    const token = generateManageToken("res_1", "jane@example.com");
    const updatedReservation = { ...mockReservation, startTime: "20:00" };

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updatedReservation,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const response = await stubApp.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { startTime: "20:00" },
    });

    expect(response.statusCode).toBe(200);
    expect(stubNotifier.rescheduleBookingReminders).toHaveBeenCalledWith(updatedReservation, token);

    await stubApp.close();
  });
});
