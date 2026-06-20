import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findReservationsNeedingReminder } from "./reminder.js";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      reservation: {
        findMany: vi.fn(),
      },
    },
  });
});

import { prisma } from "./database.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

// Restore real timers so frozen fake time does not leak into other test files
// sharded into the same worker (e.g. guest-risk's date-decay logic).
afterEach(() => {
  vi.useRealTimers();
});

describe("findReservationsNeedingReminder", () => {
  it("queries reservations 23-25h from now with PENDING/CONFIRMED status and no reminder sent", async () => {
    vi.setSystemTime(new Date("2026-06-14T10:00:00Z"));
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([]);

    await findReservationsNeedingReminder();

    expect(prisma.reservation.findMany).toHaveBeenCalledWith({
      where: {
        startTime: {
          gte: new Date("2026-06-15T09:00:00Z"),
          lte: new Date("2026-06-15T11:00:00Z"),
        },
        status: { in: ["PENDING", "CONFIRMED"] },
        reminderSentAt: null,
        guestEmail: { not: null },
      },
      include: { venue: true },
    });
  });

  it("returns matched reservations", async () => {
    vi.setSystemTime(new Date("2026-06-14T10:00:00Z"));
    const mockReservations = [
      { id: "res_1", guestEmail: "jane@example.com", startTime: new Date("2026-06-15T10:00:00Z") },
    ];
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce(mockReservations as never);

    const result = await findReservationsNeedingReminder();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("res_1");
  });
});
