import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      reservation: { groupBy: vi.fn() },
      deposit: { count: vi.fn() },
      reservationEvent: { groupBy: vi.fn() },
    },
  });
});

import { bookingMetricsService } from "./booking-metrics.js";
import { prisma } from "./database.js";
import { RESERVATION_EVENT_KINDS } from "./reservation-events.js";

const TARGET_DATE = "2026-05-15";
const DAY_START = new Date("2026-05-15T00:00:00.000Z");
const DAY_END = new Date("2026-05-16T00:00:00.000Z");

describe("bookingMetricsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.reservation.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.deposit.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.reservationEvent.groupBy).mockResolvedValue([] as never);
  });

  describe("getDailyBookingMetrics", () => {
    it("groups reservations by status for the venue and day", async () => {
      await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(prisma.reservation.groupBy).toHaveBeenCalledWith({
        by: ["status"],
        where: { venueId: "venue-1", date: DAY_START },
        _count: true,
      });
    });

    it("maps groupBy results onto the reservation status counts shape", async () => {
      vi.mocked(prisma.reservation.groupBy).mockResolvedValueOnce([
        { status: "PENDING", _count: 2 },
        { status: "CONFIRMED", _count: 5 },
        { status: "CANCELLED", _count: 1 },
        { status: "COMPLETED", _count: 3 },
        { status: "NO_SHOW", _count: 1 },
      ] as never);

      const result = await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result.reservations).toEqual({
        pending: 2,
        confirmed: 5,
        cancelled: 1,
        completed: 3,
        noShow: 1,
      });
    });

    it("defaults missing statuses to zero", async () => {
      vi.mocked(prisma.reservation.groupBy).mockResolvedValueOnce([
        { status: "CONFIRMED", _count: 5 },
      ] as never);

      const result = await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result.reservations).toEqual({
        pending: 0,
        confirmed: 5,
        cancelled: 0,
        completed: 0,
        noShow: 0,
      });
    });

    it("counts deposits per transition timestamp within the day window, scoped to the venue", async () => {
      await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(prisma.deposit.count).toHaveBeenCalledWith({
        where: {
          reservation: { venueId: "venue-1" },
          heldAt: { gte: DAY_START, lt: DAY_END },
        },
      });
      expect(prisma.deposit.count).toHaveBeenCalledWith({
        where: {
          reservation: { venueId: "venue-1" },
          appliedAt: { gte: DAY_START, lt: DAY_END },
        },
      });
      expect(prisma.deposit.count).toHaveBeenCalledWith({
        where: {
          reservation: { venueId: "venue-1" },
          refundedAt: { gte: DAY_START, lt: DAY_END },
        },
      });
      expect(prisma.deposit.count).toHaveBeenCalledWith({
        where: {
          reservation: { venueId: "venue-1" },
          forfeitedAt: { gte: DAY_START, lt: DAY_END },
        },
      });
    });

    it("maps deposit counts onto the response shape", async () => {
      vi.mocked(prisma.deposit.count)
        .mockResolvedValueOnce(4 as never) // held
        .mockResolvedValueOnce(2 as never) // applied
        .mockResolvedValueOnce(1 as never) // refunded
        .mockResolvedValueOnce(0 as never); // forfeited

      const result = await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result.deposits).toEqual({ held: 4, applied: 2, refunded: 1, forfeited: 0 });
    });

    it("counts events with one groupBy scoped to the venue and day window", async () => {
      await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(prisma.reservationEvent.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.reservationEvent.groupBy).toHaveBeenCalledWith({
        by: ["kind"],
        where: { venueId: "venue-1", createdAt: { gte: DAY_START, lt: DAY_END } },
        _count: true,
      });
    });

    it("zero-fills every event kind when there are no events", async () => {
      const result = await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(Object.keys(result.events.byKind).sort()).toEqual([...RESERVATION_EVENT_KINDS].sort());
      expect(Object.values(result.events.byKind).every((n) => n === 0)).toBe(true);
      expect(result.events.rejectedTransitions).toBe(0);
    });

    it("maps per-kind counts and surfaces rejected transitions", async () => {
      vi.mocked(prisma.reservationEvent.groupBy).mockResolvedValueOnce([
        { kind: "created", _count: 6 },
        { kind: "transition_rejected", _count: 2 },
        { kind: "deposit_transition", _count: 4 },
      ] as never);

      const result = await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result.events.byKind.created).toBe(6);
      expect(result.events.byKind.deposit_transition).toBe(4);
      expect(result.events.byKind.moved).toBe(0);
      expect(result.events.rejectedTransitions).toBe(2);
    });

    it("returns counts only, with no ids or actor keys in the events block", async () => {
      vi.mocked(prisma.reservationEvent.groupBy).mockResolvedValueOnce([
        { kind: "created", _count: 1, reservationId: "res-1", actorId: "u-1" },
      ] as never);

      const { events } = await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(Object.keys(events).sort()).toEqual(["byKind", "rejectedTransitions"]);
      expect(JSON.stringify(events)).not.toMatch(/reservationId|actorId/);
    });

    it("echoes back the requested date and venueId", async () => {
      const result = await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result.date).toBe(TARGET_DATE);
      expect(result.venueId).toBe("venue-1");
    });

    it("never includes any reservation-identifying field (PII guarantee)", async () => {
      vi.mocked(prisma.reservation.groupBy).mockResolvedValueOnce([
        { status: "CONFIRMED", _count: 5 },
      ] as never);

      const result = await bookingMetricsService.getDailyBookingMetrics({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      const serialized = JSON.stringify(result);
      for (const forbidden of ["guestName", "guestEmail", "guestPhone", '"id":']) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });
});
