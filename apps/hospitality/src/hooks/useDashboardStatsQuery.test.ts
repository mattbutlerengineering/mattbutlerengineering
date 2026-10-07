import { describe, it, expect } from "vitest";
import {
  computeStatsFromReservations,
  computeWaitlistStats,
  computeDepositStats,
} from "./useDashboardStatsQuery.js";
import type { Reservation, WaitlistEntry, Deposit } from "@mbe/types";

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

/* ── Waitlist stats ──────────────────────────────────── */

function makeWaitlistEntry(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: "wl-1",
    venueId: "venue-1",
    partySize: 2,
    guestName: "Test Guest",
    guestPhone: "555-0100",
    position: 1,
    estimatedWaitMinutes: 15,
    status: "waiting",
    notifiedAt: null,
    expiresAt: null,
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

describe("computeWaitlistStats", () => {
  it("returns 0/0 when nobody is waiting", () => {
    const stats = computeWaitlistStats([]);
    expect(stats.waitlistCount).toBe(0);
    expect(stats.longestWaitMinutes).toBe(0);
  });

  it("counts entries and finds the longest estimated wait", () => {
    const entries = [
      makeWaitlistEntry({ id: "wl-1", estimatedWaitMinutes: 10 }),
      makeWaitlistEntry({ id: "wl-2", estimatedWaitMinutes: 35 }),
      makeWaitlistEntry({ id: "wl-3", estimatedWaitMinutes: 20 }),
    ];

    const stats = computeWaitlistStats(entries);
    expect(stats.waitlistCount).toBe(3);
    expect(stats.longestWaitMinutes).toBe(35);
  });
});

/* ── Deposit stats ───────────────────────────────────── */

function makeDeposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: "dep-1",
    reservationId: "res-1",
    amountCents: 5000,
    currency: "usd",
    status: "pending",
    stripePaymentIntentId: null,
    stripeCustomerId: null,
    heldAt: null,
    appliedAt: null,
    refundedAt: null,
    forfeitedAt: null,
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

describe("computeDepositStats", () => {
  it("returns fallback stats for empty deposits list", () => {
    const stats = computeDepositStats([]);
    expect(stats.depositAtRiskCount).toBe(0);
    expect(stats.noShowExposureCents).toBe(0);
  });

  it("counts pending and held deposits toward depositAtRiskCount", () => {
    const deposits = [
      makeDeposit({ id: "d1", status: "pending" }),
      makeDeposit({ id: "d2", status: "held" }),
      makeDeposit({ id: "d3", status: "applied" }),
      makeDeposit({ id: "d4", status: "refunded" }),
      makeDeposit({ id: "d5", status: "partial_refunded" }),
      makeDeposit({ id: "d6", status: "forfeited" }),
      makeDeposit({ id: "d7", status: "uncollectable" }),
    ];

    const stats = computeDepositStats(deposits);
    expect(stats.depositAtRiskCount).toBe(2);
  });

  it("returns depositAtRiskCount equal to total when all deposits are at risk", () => {
    const deposits = [
      makeDeposit({ id: "d1", status: "pending" }),
      makeDeposit({ id: "d2", status: "held" }),
      makeDeposit({ id: "d3", status: "pending" }),
    ];

    const stats = computeDepositStats(deposits);
    expect(stats.depositAtRiskCount).toBe(3);
  });

  it("sums amountCents of forfeited deposits only for noShowExposureCents", () => {
    const deposits = [
      makeDeposit({ id: "d1", status: "forfeited", amountCents: 3000 }),
      makeDeposit({ id: "d2", status: "forfeited", amountCents: 2000 }),
      makeDeposit({ id: "d3", status: "partial_refunded", amountCents: 4000 }),
      makeDeposit({ id: "d4", status: "applied", amountCents: 1000 }),
    ];

    const stats = computeDepositStats(deposits);
    expect(stats.noShowExposureCents).toBe(5000);
  });

  it("returns noShowExposureCents equal to total when all deposits are forfeited", () => {
    const deposits = [
      makeDeposit({ id: "d1", status: "forfeited", amountCents: 1500 }),
      makeDeposit({ id: "d2", status: "forfeited", amountCents: 2500 }),
    ];

    const stats = computeDepositStats(deposits);
    expect(stats.noShowExposureCents).toBe(4000);
  });
});
