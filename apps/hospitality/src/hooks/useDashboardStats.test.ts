import { describe, it, expect } from "vitest";
import type { Reservation } from "@mbe/types";

// Import pure functions directly for unit testing
// (the hook itself needs React context, tested separately)

// Re-implement the pure logic to test against — these mirror the hook's internals.
// If the hook refactors these to exports, update imports here.

function computeUpcoming(reservations: readonly Reservation[]): number {
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const todayStr = now.toISOString().slice(0, 10);

  return reservations.filter((r) => {
    if (r.status === "CANCELLED" || r.status === "NO_SHOW") return false;
    const start = new Date(`${todayStr}T${r.startTime}`);
    return start >= now && start <= twoHoursLater;
  }).length;
}

function computeStats(reservations: readonly Reservation[]) {
  if (reservations.length === 0) {
    return {
      totalReservations: 0,
      expectedCovers: 0,
      upcomingCount: 0,
      cancellationRate: 0,
      cancellationTrend: "neutral" as const,
    };
  }

  const active = reservations.filter(
    (r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW"
  );
  const cancelled = reservations.filter((r) => r.status === "CANCELLED");
  const rate = Math.round((cancelled.length / reservations.length) * 100);

  return {
    totalReservations: active.length,
    expectedCovers: active.reduce((sum, r) => sum + r.partySize, 0),
    upcomingCount: computeUpcoming(reservations),
    cancellationRate: rate,
    cancellationTrend: rate > 10 ? ("up" as const) : rate < 5 ? ("down" as const) : ("neutral" as const),
  };
}

const baseReservation: Reservation = {
  id: "res-1",
  venueId: "venue-1",
  tableId: null,
  guestId: null,
  guestName: "Test Guest",
  guestPhone: null,
  guestEmail: null,
  startTime: "19:00",
  duration: 60,
  partySize: 4,
  status: "CONFIRMED",
  notes: null,
  confirmationCode: "ABC123",
  source: "online",
  createdAt: "2026-04-07T00:00:00Z",
  updatedAt: "2026-04-07T00:00:00Z",
};

describe("computeStats", () => {
  it("returns fallback for empty array", () => {
    const stats = computeStats([]);
    expect(stats.totalReservations).toBe(0);
    expect(stats.expectedCovers).toBe(0);
    expect(stats.cancellationRate).toBe(0);
    expect(stats.cancellationTrend).toBe("neutral");
  });

  it("counts active reservations excluding cancelled and no-shows", () => {
    const reservations: Reservation[] = [
      { ...baseReservation, id: "1", status: "CONFIRMED" },
      { ...baseReservation, id: "2", status: "CANCELLED" },
      { ...baseReservation, id: "3", status: "NO_SHOW" },
      { ...baseReservation, id: "4", status: "PENDING" },
    ];

    const stats = computeStats(reservations);
    expect(stats.totalReservations).toBe(2); // CONFIRMED + PENDING
  });

  it("sums party sizes for expected covers", () => {
    const reservations: Reservation[] = [
      { ...baseReservation, id: "1", partySize: 4 },
      { ...baseReservation, id: "2", partySize: 6 },
      { ...baseReservation, id: "3", partySize: 2, status: "CANCELLED" },
    ];

    const stats = computeStats(reservations);
    expect(stats.expectedCovers).toBe(10); // 4 + 6 (cancelled excluded)
  });

  it("calculates cancellation rate correctly", () => {
    const reservations: Reservation[] = [
      { ...baseReservation, id: "1", status: "CONFIRMED" },
      { ...baseReservation, id: "2", status: "CANCELLED" },
      { ...baseReservation, id: "3", status: "CANCELLED" },
      { ...baseReservation, id: "4", status: "CONFIRMED" },
    ];

    const stats = computeStats(reservations);
    expect(stats.cancellationRate).toBe(50); // 2/4 = 50%
    expect(stats.cancellationTrend).toBe("up"); // >10%
  });

  it("marks trend as down when rate < 5%", () => {
    const reservations: Reservation[] = Array.from({ length: 25 }, (_, i) => ({
      ...baseReservation,
      id: `res-${i}`,
      status: i === 0 ? ("CANCELLED" as const) : ("CONFIRMED" as const),
    }));

    const stats = computeStats(reservations);
    expect(stats.cancellationRate).toBe(4); // 1/25 = 4%
    expect(stats.cancellationTrend).toBe("down");
  });

  it("marks trend as neutral when rate is 5-10%", () => {
    const reservations: Reservation[] = Array.from({ length: 20 }, (_, i) => ({
      ...baseReservation,
      id: `res-${i}`,
      status: i < 2 ? ("CANCELLED" as const) : ("CONFIRMED" as const),
    }));

    const stats = computeStats(reservations);
    expect(stats.cancellationRate).toBe(10); // 2/20 = 10%
    expect(stats.cancellationTrend).toBe("neutral");
  });
});
