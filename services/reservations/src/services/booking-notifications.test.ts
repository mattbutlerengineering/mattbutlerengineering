import { describe, it, expect, vi } from "vitest";

import { createBookingNotifier } from "./booking-notifications.js";
import type { BookingNotifierDeps } from "./booking-notifications.js";
import type { NotificationDispatcher } from "@mbe/notifications";
import type { FastifyBaseLogger } from "fastify";

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

// ─── createBookingNotifier factory tests ─────────────────────────────────────────────────
// No vi.mock for @mbe/notifications or ./venue.js — deps injected directly.

describe("createBookingNotifier", () => {
  function makeDeps(overrides: Partial<BookingNotifierDeps> = {}): BookingNotifierDeps {
    const scheduleStub = vi.fn().mockResolvedValue(undefined);
    const cancelStub = vi.fn().mockResolvedValue(undefined);
    const sendConfirmStub = vi.fn().mockResolvedValue(undefined);
    const getVenueStub = vi.fn().mockResolvedValue(mockVenue);

    // NotificationDispatcher has methods with (input, preference) signatures
    const notificationAdapter: NotificationDispatcher = {
      sendBookingConfirmation: sendConfirmStub,
      sendBookingReminder: vi.fn().mockResolvedValue(undefined),
      sendBookingModified: vi.fn().mockResolvedValue(undefined),
      sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
      sendWinBack: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationDispatcher;

    return {
      notificationAdapter,
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
    expect(typeof notifier.cancelBookingNotifications).toBe("function");
  });

  it("scheduleBookingNotifications calls sendBookingConfirmation with the payload and no channel (iCal always email)", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation({
      guest: { visitCount: 1, communicationPreference: "email_only" },
    });

    await notifier.scheduleBookingNotifications(reservation as never, "token-xyz");

    // Confirmation always emails (iCal invariant) — it receives no channel arg.
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

  it("scheduleBookingNotifications skips confirmation when guestEmail is null", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation({ guestEmail: null });

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.notificationAdapter.sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("scheduleBookingNotifications skips reminders when venueId is null", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation({ venueId: null });

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.scheduler.schedule).not.toHaveBeenCalled();
  });

  it("scheduleBookingNotifications skips all reminders for walk-ins (startTime in the past)", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation({ startTime: new Date(Date.now() - 1000).toISOString() });

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.scheduler.schedule).not.toHaveBeenCalled();
  });

  it("scheduleBookingNotifications skips day-before reminder when startTime is less than 24h away", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const startMs = Date.now() + 10 * 60 * 60 * 1000; // 10h from now (< 24h)
    const reservation = makeReservation({ startTime: new Date(startMs).toISOString() });

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.scheduler.schedule).not.toHaveBeenCalledWith(
      "booking-reminder",
      expect.anything(),
      expect.anything()
    );
  });

  it("scheduleBookingNotifications skips day-of reminder when startTime is less than 2h away", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const startMs = Date.now() + 1 * 60 * 60 * 1000; // 1h from now (< 2h)
    const reservation = makeReservation({ startTime: new Date(startMs).toISOString() });

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.scheduler.schedule).not.toHaveBeenCalledWith(
      "day-of-reminder",
      expect.anything(),
      expect.anything()
    );
  });

  it("scheduleBookingNotifications schedules both reminders for future booking", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const startMs = Date.now() + 30 * 60 * 60 * 1000;
    const reservation = makeReservation({ startTime: new Date(startMs).toISOString() });

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    const dayBeforeDelayMs = startMs - Date.now() - 24 * 60 * 60 * 1000;
    const dayOfDelayMs = startMs - Date.now() - 2 * 60 * 60 * 1000;

    expect(deps.scheduler.schedule).toHaveBeenCalledWith(
      "booking-reminder",
      expect.objectContaining({ reservationId: "res-1" }),
      expect.closeTo(dayBeforeDelayMs, -2), // within 1s
      "booking-reminder:res-1"
    );
    expect(deps.scheduler.schedule).toHaveBeenCalledWith(
      "day-of-reminder",
      expect.objectContaining({ reservationId: "res-1" }),
      expect.closeTo(dayOfDelayMs, -2),
      "day-of-reminder:res-1"
    );
  });

  it("scheduleBookingNotifications enqueues a reminder payload with exactly reservationId and venueId — no resolved-channel snapshot", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const startMs = Date.now() + 30 * 60 * 60 * 1000;
    const reservation = makeReservation({
      startTime: new Date(startMs).toISOString(),
      guest: { visitCount: 1, communicationPreference: "sms_only" },
    });

    await notifier.scheduleBookingNotifications(reservation as never, "token");

    expect(deps.scheduler.schedule).toHaveBeenCalledWith(
      "booking-reminder",
      { reservationId: "res-1", venueId: "venue-1" },
      expect.any(Number),
      "booking-reminder:res-1"
    );
    expect(deps.scheduler.schedule).toHaveBeenCalledWith(
      "day-of-reminder",
      { reservationId: "res-1", venueId: "venue-1" },
      expect.any(Number),
      "day-of-reminder:res-1"
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

  it("cancelBookingNotifications tears down reminders AND dispatches the cancellation", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation();

    await notifier.cancelBookingNotifications(reservation as never, "tok-1", "guest");

    expect(deps.scheduler.cancel).toHaveBeenCalledWith("booking-reminder:res-1");
    expect(deps.scheduler.cancel).toHaveBeenCalledWith("day-of-reminder:res-1");
    expect(deps.notificationAdapter.sendBookingCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res-1",
        guestEmail: "jane@example.com",
        venueName: "The Oak Table",
        manageToken: "tok-1",
      }),
      "email_only"
    );
  });

  it("cancelBookingNotifications dispatches with the guest communication preference", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation({
      guest: { visitCount: 2, communicationPreference: "both" },
    });

    await notifier.cancelBookingNotifications(reservation as never, "tok", "staff");

    expect(deps.notificationAdapter.sendBookingCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "res-1" }),
      "both"
    );
  });

  it("cancelBookingNotifications cancels reminders but skips dispatch when getVenue returns null", async () => {
    const deps = makeDeps({ getVenue: vi.fn().mockResolvedValue(null) });
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation();

    await notifier.cancelBookingNotifications(reservation as never, "tok", "guest");

    expect(deps.scheduler.cancel).toHaveBeenCalledWith("booking-reminder:res-1");
    expect(deps.notificationAdapter.sendBookingCancelled).not.toHaveBeenCalled();
  });

  it("cancelBookingNotifications skips dispatch when guestEmail is null", async () => {
    const deps = makeDeps();
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation({ guestEmail: null });

    await notifier.cancelBookingNotifications(reservation as never, "tok", "guest");

    expect(deps.scheduler.cancel).toHaveBeenCalledWith("booking-reminder:res-1");
    expect(deps.notificationAdapter.sendBookingCancelled).not.toHaveBeenCalled();
  });

  it("cancelBookingNotifications is best-effort: swallows a dispatch failure and logs it with the initiator", async () => {
    const errorSpy = vi.fn();
    const deps = makeDeps({ logger: { error: errorSpy } as unknown as FastifyBaseLogger });
    vi.mocked(deps.notificationAdapter.sendBookingCancelled).mockRejectedValueOnce(
      new Error("Resend down")
    );
    const notifier = createBookingNotifier(deps);
    const reservation = makeReservation();

    await expect(
      notifier.cancelBookingNotifications(reservation as never, "tok", "staff")
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "res-1", initiator: "staff" }),
      expect.any(String)
    );
  });
});
