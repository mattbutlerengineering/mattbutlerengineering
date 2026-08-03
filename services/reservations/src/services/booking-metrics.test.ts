import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      reservation: { groupBy: vi.fn() },
      deposit: { count: vi.fn() },
    },
  });
});

import { bookingMetricsService } from "./booking-metrics.js";
import { prisma } from "./database.js";

const TARGET_DATE = "2026-05-15";
const DAY_START = new Date("2026-05-15T00:00:00.000Z");
const DAY_END = new Date("2026-05-16T00:00:00.000Z");

describe("bookingMetricsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.reservation.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.deposit.count).mockResolvedValue(0 as never);
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
