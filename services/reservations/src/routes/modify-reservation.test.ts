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
  // buildApp eagerly composes defaultDomainServices, which now includes
  // venueGroupService; this suite never calls it.
  venueGroupService: {},
}));

vi.mock("../services/move-to-hold.js", () => ({
  moveReservationToHold: vi.fn(),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: { reservationHold: { findUnique: vi.fn() } },
  });
});

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
import { moveReservationToHold } from "../services/move-to-hold.js";
import { prisma } from "../services/database.js";
import type { VenuePolicy } from "../services/venue.js";
import type { DepositService } from "../services/deposit.js";

/** The injected DepositService fake, passed as `buildApp({ services: { depositService } })`. */
const depositService = {
  getByReservationId: vi.fn(),
};
const injectedDeposits = depositService as unknown as DepositService;

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

const IN_WINDOW_START = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const mockVenue = {
  id: "venue_1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  address: "123 Oak St, Portland OR",
};

const SESSION_ID = "sess_1";
const SESSION_HEADERS = { "x-session-id": SESSION_ID };

/** The guest's hold on the slot the change moves to, as the service loads it. */
function mockHold(overrides: Record<string, unknown> = {}): void {
  const start = new Date(IN_WINDOW_START);
  vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce({
    id: "hold_1",
    venueId: "venue_1",
    tableId: "table_1",
    date: start,
    startTime: start,
    endTime: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    partySize: 6,
    sessionId: SESSION_ID,
    ...overrides,
  } as never);
}

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
      services: { depositService: injectedDeposits },
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

    // the manage-token scope loads the reservation once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: true,
      reservation: updatedReservation,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    mockHold();

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      headers: SESSION_HEADERS,
      payload: { holdId: "hold_1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.reservation.partySize).toBe(6);
    expect(body.data.reservation.startTime).toBe("20:00");
  });

  it("sends modified notification with guest communication preference", async () => {
    const token = generateManageToken("res_1", "jane@example.com");
    const updatedReservation = { ...mockReservation, partySize: 2 };

    // the manage-token scope loads the reservation once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: true,
      reservation: updatedReservation,
    } as never);
    // manage scope, then the guest modification policy check, then the notification
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    mockHold({ partySize: 2 });

    await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      headers: SESSION_HEADERS,
      payload: { holdId: "hold_1" },
    });

    expect(stubNotifications.sendBookingModified).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res_1",
        guestEmail: "jane@example.com",
        venueName: "The Oak Table",
        updatedAt: "2026-06-01T00:00:00Z",
      }),
      "email_only"
    );
  });

  it("returns 409 when time slot has conflict", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    // the manage-token scope loads the reservation once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: false,
      error: "Time slot is no longer available",
      errorCode: "CONFLICT",
    });
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    mockHold();

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      headers: SESSION_HEADERS,
      payload: { holdId: "hold_1" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().title).toBe("Slot Unavailable");
    expect(response.json().code).toBe("SLOT_UNAVAILABLE");
  });

  it("returns 409 for cancelled reservation", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    // the manage-token scope loads the reservation once: CANCELLED → 409
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

    // the manage-token scope loads the reservation once: COMPLETED → 409
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

    // the manage-token scope loads the reservation once
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "per_person" })
    );
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      status: "held",
    } as never);

    mockHold({ partySize: 6 });

    const response = await app.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      headers: SESSION_HEADERS,
      payload: { holdId: "hold_1" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("PARTY_SIZE_DEPOSIT_HELD");
    expect(response.json().detail).toMatch(/cancel/i);
    expect(moveReservationToHold).not.toHaveBeenCalled();
  });

  it("returns 400 when no fields provided", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    // the manage-token scope loads the reservation once
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

    // the manage-token scope loads the reservation once
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

    // the manage-token scope loads the reservation once
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
        services: { depositService: injectedDeposits },
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
        services: { depositService: injectedDeposits },
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

      // the manage-token scope loads the reservation once
      vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
      vi.mocked(moveReservationToHold).mockResolvedValueOnce({
        success: true,
        reservation: updatedReservation,
      } as never);
      mockHold();
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

      const response = await transportApp.inject({
        method: "PATCH",
        url: "/public/v1/reservations/manage",
        headers: { authorization: `Bearer ${token}`, ...SESSION_HEADERS },
        payload: { holdId: "hold_1" },
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

describe("PATCH /public/v1/reservations/manage — hold-required changes", () => {
  let holdApp: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    holdApp = await buildApp({
      services: { depositService: injectedDeposits },
      logger: false,
      notificationPort: createStubNotificationDispatcher() as never,
      jobs: {
        schedule: vi.fn().mockResolvedValue("job"),
        cancel: vi.fn().mockResolvedValue(false),
      },
    });
    await holdApp.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await holdApp.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  function patch(body: Record<string, unknown>, headers: Record<string, string> = {}) {
    const token = generateManageToken("res_1", "jane@example.com");
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValue(mockVenue as never);
    return holdApp.inject({
      method: "PATCH",
      url: `/public/v1/reservations/manage?token=${token}`,
      headers,
      payload: body,
    });
  }

  it("answers 400 HOLD_REQUIRED for a party-size change without a hold", async () => {
    const response = await patch({ partySize: 6 });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("HOLD_REQUIRED");
    expect(moveReservationToHold).not.toHaveBeenCalled();
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });

  it("answers 400 HOLD_REQUIRED when the hold has no x-session-id", async () => {
    const response = await patch({ startTime: IN_WINDOW_START, holdId: "hold_1" });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("HOLD_REQUIRED");
  });

  it("applies a specialRequests-only edit without a hold", async () => {
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: { ...mockReservation, notes: "quiet" },
    } as never);

    const response = await patch({ specialRequests: "quiet" });

    expect(response.statusCode).toBe(200);
  });

  it("answers 410 HOLD_EXPIRED and leaves the reservation alone when the hold lapsed", async () => {
    mockHold();
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: false,
      error: "Hold has expired",
      errorCode: "EXPIRED",
    });

    const response = await patch({ holdId: "hold_1" }, SESSION_HEADERS);

    expect(response.statusCode).toBe(410);
    expect(response.json().code).toBe("HOLD_EXPIRED");
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });

  it("answers 400 STATUS_CHANGE_NOT_ALLOWED for any body carrying status", async () => {
    const response = await patch({ status: "CONFIRMED", specialRequests: "x" });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("STATUS_CHANGE_NOT_ALLOWED");
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });
});

describe("PATCH /public/v1/reservations/manage — rate limiting", () => {
  it("has rate limiting configured at 10 req/min", async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    const freshApp = await buildApp({
      services: { depositService: injectedDeposits },
      logger: false,
    });
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
