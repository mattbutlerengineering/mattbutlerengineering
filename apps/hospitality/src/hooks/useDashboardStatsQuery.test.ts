import { describe, it, expect } from "vitest";
import { computeStatsFromReservations } from "./useDashboardStatsQuery.js";
import type { Reservation } from "@mbe/types";

/* ── Helpers ─────────────────────────────────────────── */

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-01-15",
    startTime: "2026-01-15T18:00:00.000Z",
    endTime: "2026-01-15T20:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    occasion: null,
    seatingPreference: null,
    guestName: "Test Guest",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: "table-1",
    venueId: "venue-1",
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

describe("computeStatsFromReservations", () => {
  it("returns fallback stats for empty reservations list", () => {
    const stats = computeStatsFromReservations([]);
    expect(stats.totalReservations).toBe(0);
    expect(stats.expectedCovers).toBe(0);
    expect(stats.upcomingCount).toBe(0);
    expect(stats.cancellationRate).toBe(0);
    expect(stats.cancellationTrend).toBe("neutral");
  });

  it("counts active reservations excluding cancelled and no-shows", () => {
    const reservations = [
      makeReservation({ id: "r1", status: "CONFIRMED", partySize: 4 }),
      makeReservation({ id: "r2", status: "PENDING", partySize: 2 }),
      makeReservation({ id: "r3", status: "CANCELLED", partySize: 6 }),
      makeReservation({ id: "r4", status: "NO_SHOW", partySize: 3 }),
      makeReservation({ id: "r5", status: "COMPLETED", partySize: 5 }),
    ];

    const stats = computeStatsFromReservations(reservations);
    expect(stats.totalReservations).toBe(3);
  });

  it("sums expected covers from active reservations only", () => {
    const reservations = [
      makeReservation({ id: "r1", status: "CONFIRMED", partySize: 4 }),
      makeReservation({ id: "r2", status: "PENDING", partySize: 2 }),
      makeReservation({ id: "r3", status: "CANCELLED", partySize: 10 }),
    ];

    const stats = computeStatsFromReservations(reservations);
    expect(stats.expectedCovers).toBe(6);
  });

  it("calculates correct cancellation rate", () => {
    const reservations = [
      makeReservation({ id: "r1", status: "CONFIRMED" }),
      makeReservation({ id: "r2", status: "CANCELLED" }),
      makeReservation({ id: "r3", status: "CONFIRMED" }),
      makeReservation({ id: "r4", status: "CANCELLED" }),
    ];

    const stats = computeStatsFromReservations(reservations);
    expect(stats.cancellationRate).toBe(50);
    expect(stats.cancellationTrend).toBe("up");
  });

  it("returns 'down' cancellation trend when rate is below 5%", () => {
    const reservations = Array.from({ length: 25 }, (_, i) =>
      makeReservation({ id: `r${i}`, status: "CONFIRMED" })
    );
    reservations.push(makeReservation({ id: "cancelled-1", status: "CANCELLED" }));

    const stats = computeStatsFromReservations(reservations);
    expect(stats.cancellationRate).toBe(4);
    expect(stats.cancellationTrend).toBe("down");
  });

  it("counts upcoming reservations when startTime is a full ISO datetime within 2 hours", () => {
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const inThreeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    const reservations = [
      makeReservation({
        id: "r-upcoming",
        status: "CONFIRMED",
        startTime: inOneHour.toISOString(),
      }),
      makeReservation({
        id: "r-too-far",
        status: "CONFIRMED",
        startTime: inThreeHours.toISOString(),
      }),
    ];

    const stats = computeStatsFromReservations(reservations);
    expect(stats.upcomingCount).toBe(1);
  });

  it("does not count cancelled reservations in upcomingCount", () => {
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

    const reservations = [
      makeReservation({
        id: "r-cancelled",
        status: "CANCELLED",
        startTime: inOneHour.toISOString(),
      }),
      makeReservation({
        id: "r-no-show",
        status: "NO_SHOW",
        startTime: inOneHour.toISOString(),
      }),
    ];

    const stats = computeStatsFromReservations(reservations);
    expect(stats.upcomingCount).toBe(0);
  });
});
