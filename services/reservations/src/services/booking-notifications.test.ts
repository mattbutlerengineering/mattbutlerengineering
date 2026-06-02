import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const { mockSchedule, mockCancel } = vi.hoisted(() => ({
  mockSchedule: vi.fn().mockResolvedValue("job-id"),
  mockCancel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@mbe/jobs", () => {
  class MockJobScheduler {
    schedule = mockSchedule;
    cancel = mockCancel;
  }
  return {
    JobScheduler: MockJobScheduler,
    JOB_TYPES: {
      BOOKING_REMINDER: "booking-reminder",
      DAY_OF_REMINDER: "day-of-reminder",
    },
  };
});

const { mockSendConfirmation } = vi.hoisted(() => ({
  mockSendConfirmation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@mbe/notifications", () => {
  class MockResendNotificationAdapter {
    sendBookingConfirmation = mockSendConfirmation;
    sendBookingReminder = vi.fn().mockResolvedValue(undefined);
    sendBookingModified = vi.fn().mockResolvedValue(undefined);
    sendBookingCancelled = vi.fn().mockResolvedValue(undefined);
    sendWinBack = vi.fn().mockResolvedValue(undefined);
  }
  return { ResendNotificationAdapter: MockResendNotificationAdapter };
});

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email_1" }) },
  })),
}));

vi.mock("../services/venue.js", () => ({
  venueService: {
    getById: vi.fn(),
  },
}));

import {
  scheduleBookingNotifications,
  cancelBookingReminders,
  rescheduleBookingReminders,
  createBookingNotifier,
} from "./booking-notifications.js";
import type { BookingNotifierDeps } from "./booking-notifications.js";
import { venueService } from "./venue.js";

const mockVenue = {
  id: "venue-1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/New_York",
  address: null,
};

const futureStartTime = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(); // 30h from now
const futureEndTime = new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString();

function makeReservation(overrides: Record<string, unknown> = {}) {
  const startTime = (overrides.startTime as string | undefined) ?? futureStartTime;
  return {
    id: "res-1",
    venueId: "venue-1",
    date: "2026-06-15",
    startTime,
    endTime: (overrides.endTime as string | undefined) ?? futureEndTime,
    partySize: 2,
    status: "CONFIRMED",
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: "+15551234567",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestId: null,
    userId: null,
    tableId: "table-1",
    table: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("scheduleBookingNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(venueService.getById).mockResolvedValue(mockVenue as never);
  });

  it("sends confirmation email when guest has email and venue exists", async () => {
    const reservation = makeReservation();
    const manageToken = "token-abc";

    await scheduleBookingNotifications(reservation as never, manageToken);

    expect(mockSendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res-1",
        guestEmail: "jane@example.com",
        venueName: "The Oak Table",
        manageToken: "token-abc",
        partySize: 2,
      })
    );
  });

  it("skips confirmation when guestEmail is null", async () => {
    const reservation = makeReservation({ guestEmail: null });

    await scheduleBookingNotifications(reservation as never, "token");

    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it("skips confirmation when venue not found", async () => {
    vi.mocked(venueService.getById).mockResolvedValue(null);
    const reservation = makeReservation();

    await scheduleBookingNotifications(reservation as never, "token");

    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it("schedules day-before reminder 24h before startTime", async () => {
    const startMs = Date.now() + 30 * 60 * 60 * 1000; // 30h from now
    const startTime = new Date(startMs).toISOString();
    const reservation = makeReservation({ startTime });

    await scheduleBookingNotifications(reservation as never, "token");

    const dayBeforeDelayMs = startMs - Date.now() - 24 * 60 * 60 * 1000;

    expect(mockSchedule).toHaveBeenCalledWith(
      "booking-reminder",
      expect.objectContaining({ reservationId: "res-1" }),
      expect.closeTo(dayBeforeDelayMs, -2) // within 1s
    );
  });

  it("schedules day-of reminder 2h before startTime", async () => {
    const startMs = Date.now() + 30 * 60 * 60 * 1000; // 30h from now
    const startTime = new Date(startMs).toISOString();
    const reservation = makeReservation({ startTime });

    await scheduleBookingNotifications(reservation as never, "token");

    const dayOfDelayMs = startMs - Date.now() - 2 * 60 * 60 * 1000;

    expect(mockSchedule).toHaveBeenCalledWith(
      "day-of-reminder",
      expect.objectContaining({ reservationId: "res-1" }),
      expect.closeTo(dayOfDelayMs, -2)
    );
  });

  it("skips day-before reminder when startTime is less than 24h away", async () => {
    const startMs = Date.now() + 10 * 60 * 60 * 1000; // 10h from now (< 24h)
    const reservation = makeReservation({ startTime: new Date(startMs).toISOString() });

    await scheduleBookingNotifications(reservation as never, "token");

    expect(mockSchedule).not.toHaveBeenCalledWith(
      "booking-reminder",
      expect.anything(),
      expect.anything()
    );
  });

  it("skips day-of reminder when startTime is less than 2h away", async () => {
    const startMs = Date.now() + 1 * 60 * 60 * 1000; // 1h from now (< 2h)
    const reservation = makeReservation({ startTime: new Date(startMs).toISOString() });

    await scheduleBookingNotifications(reservation as never, "token");

    expect(mockSchedule).not.toHaveBeenCalledWith(
      "day-of-reminder",
      expect.anything(),
      expect.anything()
    );
  });

  it("skips all reminders for walk-ins (startTime in the past)", async () => {
    const reservation = makeReservation({ startTime: new Date(Date.now() - 1000).toISOString() });

    await scheduleBookingNotifications(reservation as never, "token");

    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("passes channel=both when guestPhone and guestEmail present", async () => {
    const reservation = makeReservation();

    await scheduleBookingNotifications(reservation as never, "token");

    expect(mockSchedule).toHaveBeenCalledWith(
      "booking-reminder",
      expect.objectContaining({ channel: "both" }),
      expect.any(Number)
    );
  });

  it("passes channel=email when only guestEmail present", async () => {
    const reservation = makeReservation({ guestPhone: null });

    await scheduleBookingNotifications(reservation as never, "token");

    expect(mockSchedule).toHaveBeenCalledWith(
      "booking-reminder",
      expect.objectContaining({ channel: "email" }),
      expect.any(Number)
    );
  });

  it("skips reminders when venueId is null", async () => {
    const reservation = makeReservation({ venueId: null });

    await scheduleBookingNotifications(reservation as never, "token");

    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe("cancelBookingReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels both reminder jobs", async () => {
    await cancelBookingReminders("res-1");

    expect(mockCancel).toHaveBeenCalledWith("booking-reminder:res-1");
    expect(mockCancel).toHaveBeenCalledWith("day-of-reminder:res-1");
  });

  it("does not throw when jobs do not exist", async () => {
    mockCancel.mockRejectedValueOnce(new Error("Job not found"));
    mockCancel.mockRejectedValueOnce(new Error("Job not found"));

    await expect(cancelBookingReminders("res-1")).resolves.not.toThrow();
  });
});

describe("rescheduleBookingReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(venueService.getById).mockResolvedValue(mockVenue as never);
  });

  it("cancels old jobs then schedules new ones", async () => {
    const reservation = makeReservation();

    await rescheduleBookingReminders(reservation as never, "token");

    // Should cancel old jobs
    expect(mockCancel).toHaveBeenCalledWith("booking-reminder:res-1");
    expect(mockCancel).toHaveBeenCalledWith("day-of-reminder:res-1");

    // Should schedule new jobs
    expect(mockSchedule).toHaveBeenCalledWith(
      "booking-reminder",
      expect.any(Object),
      expect.any(Number)
    );
    expect(mockSchedule).toHaveBeenCalledWith(
      "day-of-reminder",
      expect.any(Object),
      expect.any(Number)
    );
  });
});

// ─── createBookingNotifier factory tests ────────────────────────────────────────────
// No vi.mock for @mbe/notifications or ./venue.js — deps injected directly.

describe("createBookingNotifier", () => {
  function makeDeps(overrides: Partial<BookingNotifierDeps> = {}): BookingNotifierDeps {
    const scheduleStub = vi.fn().mockResolvedValue(undefined);
    const cancelStub = vi.fn().mockResolvedValue(undefined);
    const sendConfirmStub = vi.fn().mockResolvedValue(undefined);
    const getVenueStub = vi.fn().mockResolvedValue(mockVenue);

    return {
      notificationAdapter: {
        sendBookingConfirmation: sendConfirmStub,
        sendBookingReminder: vi.fn().mockResolvedValue(undefined),
        sendBookingModified: vi.fn().mockResolvedValue(undefined),
        sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
        sendWinBack: vi.fn().mockResolvedValue(undefined),
      },
      scheduler: {
        schedule: scheduleStub,
        cancel: cancelStub,
      },
      getVenue: getVenueStub,
      ...overrides,
    };
  }

  it("createBookingNotifier returns object with correct methods", () => {
    const notifier = createBookingNotifier(makeDeps());
    expect(typeof notifier.scheduleBookingNotifications).toBe("function");
    expect(typeof notifier.cancelBookingReminders).toBe("function");
    expect(typeof notifier.rescheduleBookingReminders).toBe("function");
  });

  it("scheduleBookingNotifications calls notificationAdapter with correct payload", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation();

    await notifier.scheduleBookingNotifications(reservation as never, "token-xyz");

    expect(deps.notificationAdapter.sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res-1",
        guestEmail: "jane@example.com",
        venueName: "The Oak Table",
        manageToken: "token-xyz",
      })
    );
  });

  it("scheduleBookingNotifications calls getVenue with venueId", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation();

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.getVenue).toHaveBeenCalledWith("venue-1");
  });

  it("scheduleBookingNotifications skips confirmation when getVenue returns null", async () => {
    const deps = makeDeps({
      getVenue: vi.fn().mockResolvedValue(null),
    });
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation();

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.notificationAdapter.sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("scheduleBookingNotifications schedules both reminders for future booking", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const startMs = Date.now() + 30 * 60 * 60 * 1000;
    const reservation = makeReservation({ startTime: new Date(startMs).toISOString() });

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.scheduler.schedule).toHaveBeenCalledWith(
      "booking-reminder",
      expect.objectContaining({ reservationId: "res-1" }),
      expect.any(Number)
    );
    expect(deps.scheduler.schedule).toHaveBeenCalledWith(
      "day-of-reminder",
      expect.objectContaining({ reservationId: "res-1" }),
      expect.any(Number)
    );
  });

  it("cancelBookingReminders cancels both reminder jobs", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);

    await notifier.cancelBookingReminders("res-99");

    expect(deps.scheduler.cancel).toHaveBeenCalledWith("booking-reminder:res-99");
    expect(deps.scheduler.cancel).toHaveBeenCalledWith("day-of-reminder:res-99");
  });

  it("cancelBookingReminders does not throw when cancel rejects", async () => {
    const deps = makeDeps({
      scheduler: {
        schedule: vi.fn(),
        cancel: vi.fn().mockRejectedValue(new Error("not found")),
      },
    });
    const notifier = createBookingNotifier(deps);

    await expect(notifier.cancelBookingReminders("res-99")).resolves.not.toThrow();
  });

  it("rescheduleBookingReminders cancels then re-schedules", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation();

    await notifier.rescheduleBookingReminders(reservation as never, "token");

    expect(deps.scheduler.cancel).toHaveBeenCalledWith("booking-reminder:res-1");
    expect(deps.scheduler.cancel).toHaveBeenCalledWith("day-of-reminder:res-1");
    expect(deps.scheduler.schedule).toHaveBeenCalled();
  });

  it("resolveChannel prefers communicationPreference=email over data availability", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    // Reservation has both email and phone but pref = email
    const startMs = Date.now() + 30 * 60 * 60 * 1000;
    const reservation = {
      ...makeReservation({ startTime: new Date(startMs).toISOString() }),
      communicationPreference: "email",
    };

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.scheduler.schedule).toHaveBeenCalledWith(
      "booking-reminder",
      expect.objectContaining({ channel: "email" }),
      expect.any(Number)
    );
  });

  it("resolveChannel falls back to data availability when communicationPreference is null", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const startMs = Date.now() + 30 * 60 * 60 * 1000;
    const reservation = {
      ...makeReservation({ startTime: new Date(startMs).toISOString() }),
      communicationPreference: null,
    };

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    // email + phone -> both
    expect(deps.scheduler.schedule).toHaveBeenCalledWith(
      "booking-reminder",
      expect.objectContaining({ channel: "both" }),
      expect.any(Number)
    );
  });
});
