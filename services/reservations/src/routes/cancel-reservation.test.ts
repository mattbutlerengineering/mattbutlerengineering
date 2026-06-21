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
  },
}));

vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
    getRawById: vi.fn(),
  },
}));

vi.mock("../services/deposit.js", () => ({
  depositService: {
    getByReservationId: vi.fn(),
    refund: vi.fn(),
    refundPartial: vi.fn(),
    forfeit: vi.fn(),
  },
}));

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";
import { depositService } from "../services/deposit.js";

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

describe("DELETE /public/v1/reservations/manage", () => {
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

  it("cancels reservation and returns 200 for valid token", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
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

  it("sends cancellation notification with guest communication preference", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...mockReservation,
      status: "CANCELLED",
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    await app.inject({
      method: "DELETE",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(stubNotifications.sendBookingCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res_1",
        guestEmail: "jane@example.com",
        venueName: "The Oak Table",
      }),
      "email_only"
    );
  });

  it("returns 200 even when NotificationPort throws", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...mockReservation,
      status: "CANCELLED",
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);
    stubNotifications.sendBookingCancelled.mockRejectedValueOnce(new Error("Email service down"));

    const response = await app.inject({
      method: "DELETE",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    // Cancellation succeeded, notification failure is non-fatal
    expect(response.statusCode).toBe(200);
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

  it("returns 404 when reservation not found", async () => {
    const token = generateManageToken("res_nonexistent", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: "DELETE",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    expect(response.statusCode).toBe(404);
  });

  describe("booking notifier injection", () => {
    // Isolated app instance to test BookingNotifier injection without rate-limit bleed
    let notifierApp: FastifyInstance;
    let stubNotifier: BookingNotifier;

    beforeAll(async () => {
      stubNotifier = {
        scheduleBookingNotifications: vi.fn().mockResolvedValue(undefined),
        cancelBookingReminders: vi.fn().mockResolvedValue(undefined),
        rescheduleBookingReminders: vi.fn().mockResolvedValue(undefined),
      };
      notifierApp = await buildApp({
        logger: false,
        notificationPort: createStubNotificationDispatcher() as never,
        bookingNotifier: stubNotifier,
      });
      await notifierApp.ready();
    });

    afterAll(async () => {
      await notifierApp.close();
    });

    it("cancels reminder jobs via injected bookingNotifier", async () => {
      const token = generateManageToken("res_1", "jane@example.com");
      vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
      vi.mocked(reservationService.update).mockResolvedValueOnce({
        ...mockReservation,
        status: "CANCELLED",
      } as never);
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

      const response = await notifierApp.inject({
        method: "DELETE",
        url: `/public/v1/reservations/manage?token=${token}`,
      });

      expect(response.statusCode).toBe(200);
      expect(stubNotifier.cancelBookingReminders).toHaveBeenCalledWith("res_1");
    });
  });

  describe("cancellation policy + deposit integration", () => {
    // Fresh app instance so the outer suite's 10-request rate limit does not bleed in
    let depositApp: FastifyInstance;

    beforeAll(async () => {
      depositApp = await buildApp({
        logger: false,
        notificationPort: createStubNotificationDispatcher() as never,
      });
      await depositApp.ready();
    });

    afterAll(async () => {
      await depositApp.close();
    });

    const heldDeposit = {
      id: "dep_1",
      reservationId: "res_1",
      amountCents: 10000,
      currency: "usd",
      status: "held",
      stripePaymentIntentId: "pi_test_123",
      stripeCustomerId: null,
      heldAt: new Date(),
      appliedAt: null,
      refundedAt: null,
      forfeitedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Reservation well in the future — cancellation is within the free window
    const futureReservation = {
      ...mockReservation,
      startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    };

    // Reservation starting soon — cancellation is outside the free window
    const soonReservation = {
      ...mockReservation,
      startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };

    // Reservation already started — no-show
    const pastReservation = {
      ...mockReservation,
      startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };

    const rawVenueWithPolicy = {
      id: "venue_1",
      freeCancellationHours: 24,
      lateCancellationFeePercent: 50,
      noShowFeePercent: 100,
    };

    function setupCancelMocks(reservation: typeof mockReservation) {
      vi.mocked(reservationService.getById).mockResolvedValueOnce(reservation as never);
      vi.mocked(reservationService.update).mockResolvedValueOnce({
        ...reservation,
        status: "CANCELLED",
      } as never);
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);
    }

    it("calls depositService.refund for free cancellation (within window)", async () => {
      const token = generateManageToken("res_1", "jane@example.com");
      setupCancelMocks(futureReservation);
      vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
      vi.mocked(venueService.getRawById).mockResolvedValueOnce(rawVenueWithPolicy as never);
      vi.mocked(depositService.refund).mockResolvedValueOnce({
        ...heldDeposit,
        status: "refunded",
      } as never);

      const response = await depositApp.inject({
        method: "DELETE",
        url: `/public/v1/reservations/manage?token=${token}`,
      });

      expect(response.statusCode).toBe(200);
      expect(depositService.refund).toHaveBeenCalledWith("dep_1");
      expect(depositService.refundPartial).not.toHaveBeenCalled();
      expect(depositService.forfeit).not.toHaveBeenCalled();
    });

    it("calls depositService.refundPartial for late cancellation (outside window)", async () => {
      const token = generateManageToken("res_1", "jane@example.com");
      setupCancelMocks(soonReservation);
      vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
      vi.mocked(venueService.getRawById).mockResolvedValueOnce(rawVenueWithPolicy as never);
      vi.mocked(depositService.refundPartial).mockResolvedValueOnce({
        ...heldDeposit,
        status: "refunded",
      } as never);

      const response = await depositApp.inject({
        method: "DELETE",
        url: `/public/v1/reservations/manage?token=${token}`,
      });

      expect(response.statusCode).toBe(200);
      expect(depositService.refundPartial).toHaveBeenCalledWith("dep_1", 5000); // 50% refund of $100
      expect(depositService.refund).not.toHaveBeenCalled();
      expect(depositService.forfeit).not.toHaveBeenCalled();
    });

    it("calls depositService.forfeit for no-show (reservation already started)", async () => {
      const token = generateManageToken("res_1", "jane@example.com");
      setupCancelMocks(pastReservation);
      vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
      vi.mocked(venueService.getRawById).mockResolvedValueOnce(rawVenueWithPolicy as never);
      vi.mocked(depositService.forfeit).mockResolvedValueOnce({
        ...heldDeposit,
        status: "forfeited",
      } as never);

      const response = await depositApp.inject({
        method: "DELETE",
        url: `/public/v1/reservations/manage?token=${token}`,
      });

      expect(response.statusCode).toBe(200);
      expect(depositService.forfeit).toHaveBeenCalledWith("dep_1");
      expect(depositService.refund).not.toHaveBeenCalled();
      expect(depositService.refundPartial).not.toHaveBeenCalled();
    });

    it("calls depositService.refund when no policy is configured (freeCancellationHours is null)", async () => {
      const token = generateManageToken("res_1", "jane@example.com");
      setupCancelMocks(soonReservation);
      vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
      vi.mocked(venueService.getRawById).mockResolvedValueOnce({
        id: "venue_1",
        freeCancellationHours: null,
        lateCancellationFeePercent: null,
        noShowFeePercent: null,
      } as never);
      vi.mocked(depositService.refund).mockResolvedValueOnce({
        ...heldDeposit,
        status: "refunded",
      } as never);

      const response = await depositApp.inject({
        method: "DELETE",
        url: `/public/v1/reservations/manage?token=${token}`,
      });

      expect(response.statusCode).toBe(200);
      expect(depositService.refund).toHaveBeenCalledWith("dep_1");
    });

    it("skips deposit processing when no deposit exists", async () => {
      const token = generateManageToken("res_1", "jane@example.com");
      setupCancelMocks(futureReservation);
      vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null as never);

      const response = await depositApp.inject({
        method: "DELETE",
        url: `/public/v1/reservations/manage?token=${token}`,
      });

      expect(response.statusCode).toBe(200);
      expect(depositService.refund).not.toHaveBeenCalled();
      expect(depositService.refundPartial).not.toHaveBeenCalled();
      expect(depositService.forfeit).not.toHaveBeenCalled();
    });

    it("returns 200 even when deposit processing fails", async () => {
      const token = generateManageToken("res_1", "jane@example.com");
      setupCancelMocks(futureReservation);
      vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
      vi.mocked(venueService.getRawById).mockResolvedValueOnce(rawVenueWithPolicy as never);
      vi.mocked(depositService.refund).mockRejectedValueOnce(new Error("Stripe unavailable"));

      const response = await depositApp.inject({
        method: "DELETE",
        url: `/public/v1/reservations/manage?token=${token}`,
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
