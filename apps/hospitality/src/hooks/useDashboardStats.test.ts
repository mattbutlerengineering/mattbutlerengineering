import { describe, it, expect } from "vitest";
import { computeStats } from "./useDashboardStats.js";
import type { DashboardStats } from "./useDashboardStats.js";
import type { Reservation } from "@mbe/types";

/* ── Helpers ────────────────────────────────────────────────── */

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-01-15",
    startTime: "18:00",
    endTime: "20:00",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
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

describe("computeStats", () => {
  it("returns fallback stats for empty reservations list", () => {
    const stats: DashboardStats = computeStats([]);

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

    const stats = computeStats(reservations);

    // Active = CONFIRMED + PENDING + COMPLETED = 3
    expect(stats.totalReservations).toBe(3);
  });

  it("sums expected covers from active reservations only", () => {
    const reservations = [
      makeReservation({ id: "r1", status: "CONFIRMED", partySize: 4 }),
      makeReservation({ id: "r2", status: "PENDING", partySize: 2 }),
      makeReservation({ id: "r3", status: "CANCELLED", partySize: 10 }),
    ];

    const stats = computeStats(reservations);

    // Only CONFIRMED(4) + PENDING(2) = 6
    expect(stats.expectedCovers).toBe(6);
  });

  it("calculates correct cancellation rate", () => {
    const reservations = [
      makeReservation({ id: "r1", status: "CONFIRMED" }),
      makeReservation({ id: "r2", status: "CANCELLED" }),
      makeReservation({ id: "r3", status: "CONFIRMED" }),
      makeReservation({ id: "r4", status: "CANCELLED" }),
    ];

    const stats = computeStats(reservations);

    // 2 cancelled out of 4 = 50%
    expect(stats.cancellationRate).toBe(50);
    expect(stats.cancellationTrend).toBe("up"); // >10% -> "up"
  });

  it("returns 'down' cancellation trend when rate is below 5%", () => {
    // Need a rate < 5% -> 0 cancelled out of many
    const reservations = Array.from({ length: 25 }, (_, i) =>
      makeReservation({ id: `r${i}`, status: "CONFIRMED" })
    );
    // Add 1 cancelled to get 1/26 = ~4%
    reservations.push(makeReservation({ id: "cancelled-1", status: "CANCELLED" }));

    const stats = computeStats(reservations);

    expect(stats.cancellationRate).toBe(4); // Math.round(1/26*100) = 4
    expect(stats.cancellationTrend).toBe("down");
  });
});
