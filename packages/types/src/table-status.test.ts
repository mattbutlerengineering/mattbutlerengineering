import { describe, it, expect } from "vitest";
import type { Reservation } from "./reservation.js";
import { deriveTableDisplayStatus, RESERVED_SOON_WINDOW_MINUTES } from "./table-status.js";

const NOW = new Date("2026-02-14T19:00:00.000Z");

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res_12345678",
    date: "2026-02-14",
    startTime: "2026-02-14T19:00:00.000Z",
    endTime: "2026-02-14T21:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "table_1",
    venueId: "venue_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveTableDisplayStatus", () => {
  it("returns available when there is no reservation", () => {
    expect(deriveTableDisplayStatus({ reservation: null, hasActiveHold: false, now: NOW })).toBe(
      "available"
    );
  });

  it("returns available when the reservation is cancelled", () => {
    const reservation = makeReservation({ status: "CANCELLED" });
    expect(deriveTableDisplayStatus({ reservation, hasActiveHold: false, now: NOW })).toBe(
      "available"
    );
  });

  it("returns available when the reservation is a no-show", () => {
    const reservation = makeReservation({ status: "NO_SHOW" });
    expect(deriveTableDisplayStatus({ reservation, hasActiveHold: false, now: NOW })).toBe(
      "available"
    );
  });

  it("returns needs-bussing when the reservation is completed", () => {
    const reservation = makeReservation({ status: "COMPLETED" });
    expect(deriveTableDisplayStatus({ reservation, hasActiveHold: false, now: NOW })).toBe(
      "needs-bussing"
    );
  });

  it("returns needs-bussing for a past reservation with no active hold", () => {
    const reservation = makeReservation({
      startTime: "2026-02-14T15:00:00.000Z",
      endTime: "2026-02-14T17:00:00.000Z",
      status: "CONFIRMED",
    });
    expect(deriveTableDisplayStatus({ reservation, hasActiveHold: false, now: NOW })).toBe(
      "needs-bussing"
    );
  });

  it("returns seated when an active hold overrides an elapsed window", () => {
    const reservation = makeReservation({
      startTime: "2026-02-14T15:00:00.000Z",
      endTime: "2026-02-14T17:00:00.000Z",
      status: "CONFIRMED",
    });
    expect(deriveTableDisplayStatus({ reservation, hasActiveHold: true, now: NOW })).toBe("seated");
  });

  it("returns seated when now is within the reservation window", () => {
    const reservation = makeReservation({
      startTime: "2026-02-14T18:00:00.000Z",
      endTime: "2026-02-14T20:00:00.000Z",
      status: "CONFIRMED",
    });
    expect(deriveTableDisplayStatus({ reservation, hasActiveHold: false, now: NOW })).toBe(
      "seated"
    );
  });

  it("returns reserved-soon inside the reserved-soon window before start", () => {
    const reservation = makeReservation({
      startTime: "2026-02-14T19:20:00.000Z",
      endTime: "2026-02-14T21:20:00.000Z",
      status: "CONFIRMED",
    });
    expect(deriveTableDisplayStatus({ reservation, hasActiveHold: false, now: NOW })).toBe(
      "reserved-soon"
    );
  });

  it("includes the reserved-soon boundary at exactly the window size (inclusive)", () => {
    const start = new Date(NOW.getTime() + RESERVED_SOON_WINDOW_MINUTES * 60_000);
    const reservation = makeReservation({
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + 2 * 60 * 60_000).toISOString(),
      status: "CONFIRMED",
    });
    expect(deriveTableDisplayStatus({ reservation, hasActiveHold: false, now: NOW })).toBe(
      "reserved-soon"
    );
  });

  it("returns available for a reservation far in the future, outside the reserved-soon window", () => {
    const reservation = makeReservation({
      startTime: "2026-02-15T19:00:00.000Z",
      endTime: "2026-02-15T21:00:00.000Z",
      status: "CONFIRMED",
    });
    expect(deriveTableDisplayStatus({ reservation, hasActiveHold: false, now: NOW })).toBe(
      "available"
    );
  });
});
