import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken } from "./public-reservations.js";
import type { NotificationDispatcher } from "@mbe/notifications";

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
    getPolicyById: vi.fn(),
  },
}));

vi.mock("../services/deposit.js", () => ({
  depositService: {
    getByReservationId: vi.fn(),
  },
  setDepositServiceLogger: vi.fn(),
}));

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

// ADR-026 §3.3 item 4 / #5369 PR 8: `requireManageToken` and this route now
// resolve the reservation's venue via `resolveVenueId` — see
// public-venues.test.ts's identical comment. Resolves to `mockReservation
// .venueId`/`mockVenue.id` so both call sites' own service mocks stay in
// control of the actual test-case behavior.
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue_1"),
}));

import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";
import type { VenuePolicy } from "../services/venue.js";
import { depositService } from "../services/deposit.js";

function makeVenuePolicy(overrides: Partial<VenuePolicy> = {}): VenuePolicy {
  return {
    id: "venue_1",
    slug: "the-oak-table",
    currencyCode: "USD",
    depositEnabled: true,
    depositType: "flat",
    depositAmountCents: null,
    freeCancellationHours: null,
    lateCancellationFeePercent: null,
    noShowFeePercent: null,
    ...overrides,
  };
}

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
    // Stub jobs scheduler: the default one lazily opens a BullMQ/ioredis
    // connection on the first time-change modify, which (with no Redis in CI)
    // leaks a retry-forever ECONNREFUSED loop that races vitest worker teardown.
    app = await buildApp({
      logger: false,
      notificationPort: stubNotifications as never,
      jobs: {
        schedule: vi.fn().mockResolvedValue("job"),
        cancel: vi.fn().mockResolvedValue(false),
      },
    });
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

    // middleware ownership check + route handler each call getById once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updatedReservation,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { partySize: 6, startTime: "2026-06-15T20:00:00-07:00" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.reservation.partySize).toBe(6);
    expect(body.data.reservation.startTime).toBe("20:00");
  });

  it("sends modified notification with guest communication preference", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    const updatedReservation = { ...mockReservation, partySize: 2 };

    // middleware ownership check + route handler each call getById once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
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

    // middleware ownership check + route handler each call getById once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: false,
      error: "Time slot has a conflict with an existing reservation or hold",
      conflict: { hasConflict: true },
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { startTime: "2026-06-15T18:00:00-07:00" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().title).toBe("Slot Unavailable");
    expect(response.json().code).toBe("SLOT_UNAVAILABLE");
  });

  it("returns 409 for cancelled reservation", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    // middleware ownership check (email matches); route handler gets CANCELLED → 409
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
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
    expect(response.json().code).toBe("RESERVATION_ALREADY_CANCELLED");
  });

  it("returns 409 for completed reservation", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    // middleware ownership check (email matches); route handler gets COMPLETED → 409
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
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
    expect(response.json().code).toBe("RESERVATION_ALREADY_COMPLETED");
  });

  it("returns 409 when changing partySize on a per_person-deposit venue with a held deposit (#2931)", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    // middleware ownership check + route handler each call getById once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "per_person" })
    );
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      status: "held",
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { partySize: 6 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("PARTY_SIZE_DEPOSIT_HELD");
    expect(response.json().detail).toMatch(/cancel/i);
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });

  it("returns 400 when no fields provided", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    // middleware ownership check + route handler each call getById once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().detail).toContain("At least one field");
    expect(response.json().code).toBe("NO_CHANGES_PROVIDED");
  });

  it("returns 404 when reservation not found", async () => {
    const token = generateManageToken("res_nonexistent", "jane@example.com");

    // middleware ownership check + route handler each call getById once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(null as never);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      payload: { partySize: 2 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("RESERVATION_NOT_FOUND");
  });

  it("allows modifying special requests only", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    const updatedReservation = {
      ...mockReservation,
      notes: "No peanuts please",
    };

    // middleware ownership check + route handler each call getById once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
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

  // Built on a dedicated app instance so these two additional requests don't
  // push the shared `app`'s rate limiter (max 10/min) past the tests above.
  describe("body validation", () => {
    let validationApp: FastifyInstance;

    beforeAll(async () => {
      validationApp = await buildApp({
        logger: false,
        notificationPort: createStubNotificationDispatcher() as never,
        jobs: {
          schedule: vi.fn().mockResolvedValue("job"),
          cancel: vi.fn().mockResolvedValue(false),
        },
      });
      await validationApp.ready();
    });

    afterAll(async () => {
      await validationApp.close();
    });

    it("rejects a malformed startTime with 400 before reaching the service layer", async () => {
      const token = generateManageToken("res_1", "jane@example.com");

      const response = await validationApp.inject({
        method: "PATCH",
        url: `/public/v1/reservations/manage?token=${token}`,
        payload: { startTime: "not-a-date" },
      });

      expect(response.statusCode).toBe(400);
      expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
    });

    it("rejects a wrong-typed partySize with 400 before reaching the service layer", async () => {
      const token = generateManageToken("res_1", "jane@example.com");

      const response = await validationApp.inject({
        method: "PATCH",
        url: `/public/v1/reservations/manage?token=${token}`,
        payload: { partySize: "six" },
      });

      expect(response.statusCode).toBe(400);
      expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
    });

    it("rejects a partySize over 20 with 400 before reaching the service layer", async () => {
      const token = generateManageToken("res_1", "jane@example.com");

      const response = await validationApp.inject({
        method: "PATCH",
        url: `/public/v1/reservations/manage?token=${token}`,
        payload: { partySize: 9999 },
      });

      expect(response.statusCode).toBe(400);
      expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
    });

    it("rejects specialRequests exceeding 500 characters with 400", async () => {
      const token = generateManageToken("res_1", "jane@example.com");
      const tooLongRequests = "x".repeat(501);

      const response = await validationApp.inject({
        method: "PATCH",
        url: `/public/v1/reservations/manage?token=${token}`,
        payload: { specialRequests: tooLongRequests },
      });

      expect(response.statusCode).toBe(400);
      expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
    });
  });

  describe("manage-token transport", () => {
    // Isolated app instance so these requests don't count against the outer
    // suite's 10-request rate limit budget.
    let transportApp: FastifyInstance;

    beforeAll(async () => {
      transportApp = await buildApp({
        logger: false,
        notificationPort: createStubNotificationDispatcher() as never,
        jobs: {
          schedule: vi.fn().mockResolvedValue("job"),
          cancel: vi.fn().mockResolvedValue(false),
        },
      });
      await transportApp.ready();
    });

    afterAll(async () => {
      await transportApp.close();
    });

    it("modifies reservation and returns 200 when the token is sent as an Authorization: Bearer header", async () => {
      const token = generateManageToken("res_1", "jane@example.com");
      const updatedReservation = {
        ...mockReservation,
        partySize: 6,
        startTime: "20:00",
      };

      // middleware ownership check + route handler each call getById once
      vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
      vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: updatedReservation,
      } as never);
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

      const response = await transportApp.inject({
        method: "PATCH",
        url: "/public/v1/reservations/manage",
        headers: { authorization: `Bearer ${token}` },
        payload: { partySize: 6, startTime: "2026-06-15T20:00:00-07:00" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.reservation.partySize).toBe(6);
      expect(body.data.reservation.startTime).toBe("20:00");
    });

    it("returns 400 when modifying with neither an Authorization header nor a token query param", async () => {
      const response = await transportApp.inject({
        method: "PATCH",
        url: "/public/v1/reservations/manage",
        payload: { partySize: 6 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().title).toBe("Missing Token");
    });
  });
});

describe("PATCH /public/v1/reservations/manage — rate limiting", () => {
  it("has rate limiting configured at 10 req/min", async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    const freshApp = await buildApp({ logger: false });
    await freshApp.ready();

    // Send 11 requests — the 11th should be rate-limited
    const responses = [];
    for (let i = 0; i < 11; i++) {
      const response = await freshApp.inject({
        method: "PATCH",
        url: "/public/v1/reservations/manage?token=garbage-token",
        payload: { partySize: 2 },
      });
      responses.push(response);
    }

    await freshApp.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;

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
