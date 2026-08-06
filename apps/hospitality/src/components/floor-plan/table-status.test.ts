import { describe, it, expect } from "vitest";
import type { Reservation } from "@mbe/types";
import {
  RESERVED_SOON_WINDOW_MINUTES,
  TABLE_STATUS_COLOR_TOKEN,
  deriveTableStatus,
} from "./table-status.js";

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

describe("table-status", () => {
  describe("deriveTableStatus", () => {
    it("returns available when there is no reservation", () => {
      expect(deriveTableStatus({ reservation: null, hasActiveHold: false, now: NOW })).toEqual({
        status: "available",
        colorToken: "var(--rialto-success)",
      });
    });

    it("returns available when there is no reservation, even with an active hold", () => {
      // A hold without a reservation should never happen in real data — the
      // absence of a reservation always short-circuits to available.
      expect(deriveTableStatus({ reservation: null, hasActiveHold: true, now: NOW })).toEqual({
        status: "available",
        colorToken: "var(--rialto-success)",
      });
    });

    it("returns available when the reservation is cancelled", () => {
      const reservation = makeReservation({ status: "CANCELLED" });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "available",
        colorToken: "var(--rialto-success)",
      });
    });

    it("returns available when the reservation is a no-show", () => {
      const reservation = makeReservation({ status: "NO_SHOW" });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "available",
        colorToken: "var(--rialto-success)",
      });
    });

    it("returns needs-bussing when the reservation is completed", () => {
      const reservation = makeReservation({ status: "COMPLETED" });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "needs-bussing",
        colorToken: "var(--rialto-warning)",
      });
    });

    it("returns needs-bussing for a past reservation with no active hold", () => {
      // Reservation window has fully elapsed (now >= endTime) and nobody
      // marked it COMPLETED yet — the table still needs to be flagged.
      const reservation = makeReservation({
        startTime: "2026-02-14T15:00:00.000Z",
        endTime: "2026-02-14T17:00:00.000Z",
        status: "CONFIRMED",
      });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "needs-bussing",
        colorToken: "var(--rialto-warning)",
      });
    });

    it("returns seated for a past reservation that still has an active hold", () => {
      // An active hold overrides the elapsed-time default — the guest is
      // still physically at the table even though the window has passed.
      const reservation = makeReservation({
        startTime: "2026-02-14T15:00:00.000Z",
        endTime: "2026-02-14T17:00:00.000Z",
        status: "CONFIRMED",
      });
      expect(deriveTableStatus({ reservation, hasActiveHold: true, now: NOW })).toEqual({
        status: "seated",
        colorToken: "var(--rialto-error)",
      });
    });

    it("returns seated for a future reservation that already has an active hold", () => {
      // Early check-in: staff seated the party ahead of the nominal start time.
      const reservation = makeReservation({
        startTime: "2026-02-14T23:00:00.000Z",
        endTime: "2026-02-15T01:00:00.000Z",
        status: "PENDING",
      });
      expect(deriveTableStatus({ reservation, hasActiveHold: true, now: NOW })).toEqual({
        status: "seated",
        colorToken: "var(--rialto-error)",
      });
    });

    it("returns seated when now is within the reservation window", () => {
      const reservation = makeReservation({
        startTime: "2026-02-14T18:00:00.000Z",
        endTime: "2026-02-14T20:00:00.000Z",
        status: "CONFIRMED",
      });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "seated",
        colorToken: "var(--rialto-error)",
      });
    });

    it("returns seated when now is within the window for a still-pending reservation", () => {
      // A reservation's status field tracks the booking lifecycle, not
      // physical occupancy — PENDING inside the active window still seats.
      const reservation = makeReservation({
        startTime: "2026-02-14T18:00:00.000Z",
        endTime: "2026-02-14T20:00:00.000Z",
        status: "PENDING",
      });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "seated",
        colorToken: "var(--rialto-error)",
      });
    });

    it("treats the reservation start time as inclusive (seated at exactly startTime)", () => {
      const reservation = makeReservation({
        startTime: "2026-02-14T19:00:00.000Z",
        endTime: "2026-02-14T21:00:00.000Z",
      });
      expect(
        deriveTableStatus({
          reservation,
          hasActiveHold: false,
          now: new Date("2026-02-14T19:00:00.000Z"),
        })
      ).toEqual({ status: "seated", colorToken: "var(--rialto-error)" });
    });

    it("treats the reservation end time as exclusive (needs-bussing at exactly endTime)", () => {
      const reservation = makeReservation({
        startTime: "2026-02-14T17:00:00.000Z",
        endTime: "2026-02-14T19:00:00.000Z",
      });
      expect(
        deriveTableStatus({
          reservation,
          hasActiveHold: false,
          now: new Date("2026-02-14T19:00:00.000Z"),
        })
      ).toEqual({ status: "needs-bussing", colorToken: "var(--rialto-warning)" });
    });

    it("returns reserved-soon inside the reserved-soon window before start", () => {
      const reservation = makeReservation({
        startTime: "2026-02-14T19:20:00.000Z",
        endTime: "2026-02-14T21:20:00.000Z",
        status: "CONFIRMED",
      });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "reserved-soon",
        colorToken: "var(--rialto-accent)",
      });
    });

    it("includes the reserved-soon boundary at exactly the window size (inclusive)", () => {
      const start = new Date(NOW.getTime() + RESERVED_SOON_WINDOW_MINUTES * 60_000);
      const reservation = makeReservation({
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + 2 * 60 * 60_000).toISOString(),
        status: "CONFIRMED",
      });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "reserved-soon",
        colorToken: "var(--rialto-accent)",
      });
    });

    it("excludes the reserved-soon boundary one millisecond past the window (available)", () => {
      const start = new Date(NOW.getTime() + RESERVED_SOON_WINDOW_MINUTES * 60_000 + 1);
      const reservation = makeReservation({
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + 2 * 60 * 60_000).toISOString(),
        status: "CONFIRMED",
      });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "available",
        colorToken: "var(--rialto-success)",
      });
    });

    it("returns available for a reservation far in the future, outside the reserved-soon window", () => {
      const reservation = makeReservation({
        startTime: "2026-02-15T19:00:00.000Z",
        endTime: "2026-02-15T21:00:00.000Z",
        status: "CONFIRMED",
      });
      expect(deriveTableStatus({ reservation, hasActiveHold: false, now: NOW })).toEqual({
        status: "available",
        colorToken: "var(--rialto-success)",
      });
    });
  });

  describe("TABLE_STATUS_COLOR_TOKEN", () => {
    it("maps every status to a rialto design token, not a raw color value", () => {
      for (const token of Object.values(TABLE_STATUS_COLOR_TOKEN)) {
        expect(token).toMatch(/^var\(--rialto-[a-z-]+\)$/);
      }
    });

    it("assigns a distinct color token to each of the four statuses", () => {
      const tokens = Object.values(TABLE_STATUS_COLOR_TOKEN);
      expect(new Set(tokens).size).toBe(tokens.length);
    });
  });
});
