import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Reservation } from "@mbe/types";

vi.mock("./reservation.js", () => ({
  reservationService: {
    updateWithConflictCheck: vi.fn(),
  },
}));

vi.mock("./venue.js", () => ({
  venueService: {
    getById: vi.fn(),
  },
}));

import { reservationService } from "./reservation.js";
import { venueService } from "./venue.js";
import {
  modifyReservationWithNotifications,
  skipDepositRepricingOnPartySizeChange,
  type ModifyReservationDeps,
} from "./reservation-modification.js";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res_1",
    date: "2026-06-15",
    startTime: "19:00",
    endTime: "21:00",
    partySize: 4,
    status: "PENDING",
    notes: "Window seat please",
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: "+1555000111",
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "table_1",
    guest: { visitCount: 3, communicationPreference: "email_only" },
    venueId: "venue_1",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function makeDeps() {
  return {
    bookingNotifier: {
      scheduleBookingNotifications: vi.fn().mockResolvedValue(undefined),
      cancelBookingReminders: vi.fn().mockResolvedValue(undefined),
      rescheduleBookingReminders: vi.fn().mockResolvedValue(undefined),
    },
    notificationPort: {
      sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
      sendBookingReminder: vi.fn().mockResolvedValue(undefined),
      sendBookingModified: vi.fn().mockResolvedValue(undefined),
      sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
      sendWinBack: vi.fn().mockResolvedValue(undefined),
    },
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  } as unknown as ModifyReservationDeps & {
    bookingNotifier: {
      rescheduleBookingReminders: ReturnType<typeof vi.fn>;
    };
    notificationPort: { sendBookingModified: ReturnType<typeof vi.fn> };
  };
}

const mockVenue = {
  id: "venue_1",
  name: "The Oak Table",
  ianaTimezone: "America/Los_Angeles",
};

describe("modifyReservationWithNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NO_CHANGES_PROVIDED when no fields are provided", async () => {
    const reservation = makeReservation();

    const result = await modifyReservationWithNotifications(
      reservation,
      {},
      "token123",
      makeDeps()
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("NO_CHANGES_PROVIDED");
    }
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });

  it("returns SLOT_UNAVAILABLE (409) when the conflict check reports a conflict", async () => {
    const reservation = makeReservation();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: false,
      error: "Time slot has a conflict with an existing reservation or hold",
      conflict: { hasConflict: true },
    } as never);

    const result = await modifyReservationWithNotifications(
      reservation,
      { startTime: "18:00" },
      "token123",
      makeDeps()
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("SLOT_UNAVAILABLE");
    }
  });

  it("returns RESERVATION_UPDATE_FAILED (500) when the update fails without a conflict", async () => {
    const reservation = makeReservation();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: false,
      error: "Database unavailable",
    } as never);

    const result = await modifyReservationWithNotifications(
      reservation,
      { partySize: 2 },
      "token123",
      makeDeps()
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(500);
      expect(result.code).toBe("RESERVATION_UPDATE_FAILED");
    }
  });

  it("reschedules reminder jobs via bookingNotifier when the time changes", async () => {
    const reservation = makeReservation();
    const updated = { ...reservation, startTime: "20:00" };
    const deps = makeDeps();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const result = await modifyReservationWithNotifications(
      reservation,
      { startTime: "20:00" },
      "token123",
      deps
    );

    expect(result.success).toBe(true);
    expect(deps.bookingNotifier.rescheduleBookingReminders).toHaveBeenCalledWith(
      updated,
      "token123"
    );
  });

  it("does NOT reschedule reminder jobs when only partySize changes", async () => {
    const reservation = makeReservation();
    const updated = { ...reservation, partySize: 2 };
    const deps = makeDeps();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const result = await modifyReservationWithNotifications(
      reservation,
      { partySize: 2 },
      "token123",
      deps
    );

    expect(result.success).toBe(true);
    expect(deps.bookingNotifier.rescheduleBookingReminders).not.toHaveBeenCalled();
  });

  it("does NOT reschedule reminder jobs when only specialRequests changes", async () => {
    const reservation = makeReservation();
    const updated = { ...reservation, notes: "No peanuts please" };
    const deps = makeDeps();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const result = await modifyReservationWithNotifications(
      reservation,
      { specialRequests: "No peanuts please" },
      "token123",
      deps
    );

    expect(result.success).toBe(true);
    expect(deps.bookingNotifier.rescheduleBookingReminders).not.toHaveBeenCalled();
  });

  it("dispatches the modified notification with the guest's communication preference", async () => {
    const reservation = makeReservation();
    const updated = { ...reservation, partySize: 2 };
    const deps = makeDeps();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    await modifyReservationWithNotifications(reservation, { partySize: 2 }, "token123", deps);

    expect(deps.notificationPort.sendBookingModified).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res_1",
        guestEmail: "jane@example.com",
        venueName: "The Oak Table",
        manageToken: "token123",
        sequence: 2,
      }),
      "email_only"
    );
  });

  it("does not send a notification when the reservation has no guestEmail", async () => {
    const reservation = makeReservation({ guestEmail: null });
    const updated = { ...reservation, partySize: 2 };
    const deps = makeDeps();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    await modifyReservationWithNotifications(reservation, { partySize: 2 }, "token123", deps);

    expect(deps.notificationPort.sendBookingModified).not.toHaveBeenCalled();
  });

  it("maps changes onto the update payload (specialRequests -> notes)", async () => {
    const reservation = makeReservation();
    const updated = { ...reservation, notes: "No peanuts please" };
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    await modifyReservationWithNotifications(
      reservation,
      { specialRequests: "No peanuts please" },
      "token123",
      makeDeps()
    );

    expect(reservationService.updateWithConflictCheck).toHaveBeenCalledWith("res_1", {
      notes: "No peanuts please",
    });
  });

  it("updates partySize without re-evaluating the deposit (no-repricing pinned behavior, see #2931)", async () => {
    const reservation = makeReservation({ partySize: 4 });
    const updated = { ...reservation, partySize: 10 };
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const result = await modifyReservationWithNotifications(
      reservation,
      { partySize: 10 },
      "token123",
      makeDeps()
    );

    expect(result.success).toBe(true);
    // Only the partySize field is sent to the update — no deposit fields are
    // read, written, or re-derived from the new partySize. Repricing a
    // per_person deposit on partySize change is a separate HITL product
    // decision tracked in #2931.
    expect(reservationService.updateWithConflictCheck).toHaveBeenCalledWith("res_1", {
      partySize: 10,
    });
  });
});

describe("skipDepositRepricingOnPartySizeChange (#2931 seam)", () => {
  it("is a documented no-op today — deposit amount is never re-evaluated on partySize change", () => {
    const reservation = makeReservation({ partySize: 4 });

    expect(() =>
      skipDepositRepricingOnPartySizeChange(reservation, { partySize: 8 })
    ).not.toThrow();
  });
});
