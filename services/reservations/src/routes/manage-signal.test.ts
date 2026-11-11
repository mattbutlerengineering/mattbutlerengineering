import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken } from "./public-reservations.js";
import type { NotificationDispatcher } from "../notifications/index.js";
import type { JobsPort } from "../transitions/ports.js";

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
    getPolicyById: vi.fn(),
  },
  // buildApp eagerly composes defaultDomainServices, which now includes
  // venueGroupService; this suite never calls it.
  venueGroupService: {},
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
vi.mock("../services/guest-signal.js", () => ({
  countGuestSignals: vi.fn(),
  recordGuestSignal: vi.fn(),
}));

import { countGuestSignals, recordGuestSignal } from "../services/guest-signal.js";
import { venueService } from "../services/venue.js";
import type { DepositService } from "../services/deposit.js";

/** The injected DepositService fake, passed as `buildApp({ services: { depositService } })`. */
const depositService = {
  getByReservationId: vi.fn(),
  refund: vi.fn(),
  refundPartial: vi.fn(),
  forfeit: vi.fn(),
};
const injectedDeposits = depositService as unknown as DepositService;

const mockReservation = {
  id: "res_1",
  venueId: "venue_1",
  date: "2026-07-10",
  startTime: "2026-07-10T22:00:00.000Z",
  endTime: "2026-07-10T23:30:00.000Z",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+1555000111",
  status: "CONFIRMED",
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
  ianaTimezone: "America/New_York",
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

// Every app instance must inject a stub jobs scheduler: the default one
// lazily opens a BullMQ/ioredis connection on the first cancel, which (with no
// Redis in CI) leaks a retry-forever ECONNREFUSED loop past the test run and
// races vitest worker teardown (EnvironmentTeardownError).
function createStubJobs(): JobsPort {
  return {
    schedule: vi.fn().mockResolvedValue("job"),
    cancel: vi.fn().mockResolvedValue(false),
  };
}

describe("POST /public/v1/reservations/manage/signal", () => {
  let app: FastifyInstance;
  const token = () => generateManageToken("res_1", "jane@example.com");
  const post = (payload: unknown, t = token()) =>
    app.inject({
      method: "POST",
      url: `/public/v1/reservations/manage/signal?token=${t}`,
      payload: payload as object,
    });

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({
      services: { depositService: injectedDeposits },
      logger: false,
      notificationPort: createStubNotificationDispatcher() as never,
      jobs: createStubJobs(),
    });
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-10T21:00:00Z"));
    vi.mocked(reservationService.getById).mockResolvedValue(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValue(mockVenue as never);
    vi.mocked(countGuestSignals).mockResolvedValue({ late: 0, arrived: 0 });
    vi.mocked(recordGuestSignal).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  it("records a running-late signal and leaves the booking untouched", async () => {
    const res = await post({ kind: "running-late", minutes: 15 });
    expect(res.statusCode).toBe(200);
    expect(recordGuestSignal).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "res_1", kind: "running-late", minutes: 15 })
    );
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("records an arrived signal", async () => {
    const res = await post({ kind: "arrived" });
    expect(res.statusCode).toBe(200);
    expect(recordGuestSignal).toHaveBeenCalledWith(expect.objectContaining({ kind: "arrived" }));
  });

  it("401s on a malformed token", async () => {
    const res = await post({ kind: "arrived" }, "garbage");
    expect(res.statusCode).toBe(401);
    expect(recordGuestSignal).not.toHaveBeenCalled();
  });

  it("400s on an unsupported late duration", async () => {
    const res = await post({ kind: "running-late", minutes: 7 });
    expect(res.statusCode).toBe(400);
  });

  it("409s outside the signal window", async () => {
    vi.setSystemTime(new Date("2026-07-10T10:00:00Z"));
    const res = await post({ kind: "arrived" });
    expect(res.statusCode).toBe(409);
    expect(recordGuestSignal).not.toHaveBeenCalled();
  });

  it("409s for a cancelled reservation", async () => {
    vi.mocked(reservationService.getById).mockResolvedValue({
      ...mockReservation,
      status: "CANCELLED",
    } as never);
    const res = await post({ kind: "arrived" });
    expect(res.statusCode).toBe(409);
    expect(recordGuestSignal).not.toHaveBeenCalled();
  });

  it("429s once the late-signal cap is reached", async () => {
    vi.mocked(countGuestSignals).mockResolvedValue({ late: 3, arrived: 0 });
    const res = await post({ kind: "running-late", minutes: 5 });
    expect(res.statusCode).toBe(429);
    expect(recordGuestSignal).not.toHaveBeenCalled();
  });
});
