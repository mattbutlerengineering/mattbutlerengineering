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
} from "./booking-notifications.js";
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
