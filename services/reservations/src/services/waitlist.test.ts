import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  // `recalculateVenuePositions` now wraps its raw UPDATE in `$transaction`
  // so `setVenueContext` (ADR-026 part 6) can set app.venue_id first —
  // `$transaction` invokes its callback with a `tx` reusing THIS SAME
  // `$executeRaw` mock, so existing `prisma.$executeRaw` assertions still
  // see both the set_config call and the recalc UPDATE.
  const executeRaw = vi.fn().mockResolvedValue(0);
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  return createMockDatabaseService({
    prisma: {
      $executeRawUnsafe: executeRawUnsafe,
      $executeRaw: executeRaw,
      $transaction: vi.fn(
        (
          fn: (tx: {
            $executeRaw: typeof executeRaw;
            $executeRawUnsafe: typeof executeRawUnsafe;
          }) => unknown
        ) => fn({ $executeRaw: executeRaw, $executeRawUnsafe: executeRawUnsafe })
      ),
      venue: { findUnique: vi.fn() },
      table: { findMany: vi.fn() },
      reservation: { findMany: vi.fn() },
      waitlistEntry: {
        count: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
  });
});

import { waitlistService } from "./waitlist.js";
import { prisma } from "./database.js";

const NOW = new Date("2026-06-01T18:00:00Z");
const TWO_TABLES = [
  { id: "t1", capacity: 4, minCovers: 1, maxCovers: null, isActive: true },
  { id: "t2", capacity: 4, minCovers: 1, maxCovers: null, isActive: true },
];

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "wl-1",
    venueId: "venue-1",
    partySize: 2,
    guestName: "Jane Doe",
    guestPhone: "+15551234567",
    position: 1,
    estimatedWaitMinutes: 30,
    status: "waiting",
    notifiedAt: null,
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("waitlistService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("estimates the new entry's wait from table turnover at its position", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({ settings: null } as never);
      vi.mocked(prisma.table.findMany).mockResolvedValueOnce(TWO_TABLES as never);
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.waitlistEntry.count).mockResolvedValueOnce(2 as never);
      const created = makeEntry({ position: 3, estimatedWaitMinutes: 75 });
      vi.mocked(prisma.waitlistEntry.create).mockResolvedValueOnce(created as never);

      const result = await waitlistService.create({
        venueId: "venue-1",
        partySize: 2,
        guestName: "Jane Doe",
        guestPhone: "+15551234567",
      });

      expect(prisma.waitlistEntry.count).toHaveBeenCalledWith({
        where: { venueId: "venue-1", status: "waiting" },
      });
      // Position 3 of 2 free tables: first table again after one 75min cycle.
      expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: {
          venueId: "venue-1",
          partySize: 2,
          guestName: "Jane Doe",
          guestPhone: "+15551234567",
          position: 3,
          estimatedWaitMinutes: 75,
        },
      });
      expect(result).toEqual(created);
      vi.useRealTimers();
    });

    it("uses provided avgTurnTimeMinutes for the wait estimate", async () => {
      vi.mocked(prisma.waitlistEntry.count).mockResolvedValueOnce(0 as never);
      const created = makeEntry({ position: 1, estimatedWaitMinutes: 15 });
      vi.mocked(prisma.waitlistEntry.create).mockResolvedValueOnce(created as never);

      const result = await waitlistService.create({
        venueId: "venue-1",
        partySize: 4,
        guestName: "Sam Roe",
        guestPhone: "+15550000000",
        avgTurnTimeMinutes: 15,
      });

      expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ position: 1, estimatedWaitMinutes: 15 }),
      });
      expect(result.estimatedWaitMinutes).toBe(15);
    });
  });

  describe("withLiveEstimates", () => {
    it("rewrites each waiting entry's estimate from current table turnover, not its stored snapshot", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({ settings: null } as never);
      vi.mocked(prisma.table.findMany).mockResolvedValueOnce(TWO_TABLES as never);
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
        {
          tableId: "t2",
          status: "CONFIRMED",
          startTime: new Date(NOW.getTime() - 30 * 60_000),
          endTime: new Date(NOW.getTime() + 40 * 60_000),
        },
      ] as never);
      const entries = [
        makeEntry({ id: "a", position: 1, estimatedWaitMinutes: 999 }),
        makeEntry({ id: "b", position: 2, estimatedWaitMinutes: 999 }),
        makeEntry({ id: "c", position: 3, estimatedWaitMinutes: 999 }),
      ];

      const result = await waitlistService.withLiveEstimates(entries as never);

      expect(result.map((e) => e.estimatedWaitMinutes)).toEqual([0, 40, 75]);
      expect(prisma.reservation.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ status: { in: ["PENDING", "CONFIRMED"] } }),
      });
      vi.useRealTimers();
    });

    it("keeps the stored estimate when no table can seat the party", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({ settings: null } as never);
      vi.mocked(prisma.table.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);

      const result = await waitlistService.withLiveEstimates([
        makeEntry({ estimatedWaitMinutes: 42 }),
      ] as never);

      expect(result[0]?.estimatedWaitMinutes).toBe(42);
    });
  });

  describe("listWaiting", () => {
    it("returns waiting entries for the venue ordered by position", async () => {
      const entries = [makeEntry(), makeEntry({ id: "wl-2", position: 2 })];
      vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValueOnce(entries as never);

      const result = await waitlistService.listWaiting("venue-1");

      expect(prisma.waitlistEntry.findMany).toHaveBeenCalledWith({
        where: { venueId: "venue-1", status: "waiting" },
        orderBy: { position: "asc" },
      });
      expect(result).toEqual(entries);
    });
  });

  describe("listActive", () => {
    it("keeps notified parties on the staff list (waiting + notified), so they can still be seated", async () => {
      const notified = makeEntry({ status: "notified", notifiedAt: NOW });
      vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValueOnce([notified] as never);

      const result = await waitlistService.listActive("venue-1");

      expect(prisma.waitlistEntry.findMany).toHaveBeenCalledWith({
        where: { venueId: "venue-1", status: { in: ["waiting", "notified"] } },
        orderBy: { position: "asc" },
      });
      expect(result).toEqual([notified]);
    });
  });

  describe("getById", () => {
    it("returns the entry when found", async () => {
      const entry = makeEntry();
      vi.mocked(prisma.waitlistEntry.findUnique).mockResolvedValueOnce(entry as never);

      const result = await waitlistService.getById("wl-1");

      expect(prisma.waitlistEntry.findUnique).toHaveBeenCalledWith({ where: { id: "wl-1" } });
      expect(result).toEqual(entry);
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.waitlistEntry.findUnique).mockResolvedValueOnce(null as never);

      expect(await waitlistService.getById("missing")).toBeNull();
    });
  });

  describe("seat", () => {
    it("marks the entry seated and recalculates remaining venue positions", async () => {
      const seated = makeEntry({ status: "seated" });
      vi.mocked(prisma.waitlistEntry.update).mockResolvedValueOnce(seated as never);
      // Remaining waiting entries have gapped positions after the seated entry left the queue
      vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValueOnce([
        { id: "wl-2", position: 2 },
        { id: "wl-3", position: 4 },
      ] as never);

      const result = await waitlistService.seat("wl-1");

      expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: "wl-1" },
        data: { status: "seated" },
      });
      expect(prisma.waitlistEntry.findMany).toHaveBeenCalledWith({
        where: { venueId: "venue-1", status: "waiting" },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      // Batched into a single $executeRaw call, not one updateMany per
      // entry — plus setVenueContext's set_config call (ADR-026 part 6).
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(result).toEqual(seated);
    });

    it("returns null and skips recalculation when the entry does not exist", async () => {
      vi.mocked(prisma.waitlistEntry.update).mockRejectedValueOnce({ code: "P2025" } as never);

      const result = await waitlistService.seat("missing");

      expect(result).toBeNull();
      expect(prisma.waitlistEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("cancel", () => {
    it("marks the entry cancelled and recalculates remaining venue positions", async () => {
      const cancelled = makeEntry({ id: "wl-2", position: 2, status: "cancelled" });
      vi.mocked(prisma.waitlistEntry.update).mockResolvedValueOnce(cancelled as never);
      vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValueOnce([
        { id: "wl-1", position: 1 },
        { id: "wl-3", position: 3 },
        { id: "wl-4", position: 4 },
      ] as never);

      const result = await waitlistService.cancel("wl-2");

      expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: "wl-2" },
        data: { status: "cancelled" },
      });
      // Batched into a single $executeRaw call, not one updateMany per
      // entry — plus setVenueContext's set_config call (ADR-026 part 6).
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(result).toEqual(cancelled);
    });

    it("returns null and skips recalculation when the entry does not exist", async () => {
      vi.mocked(prisma.waitlistEntry.update).mockRejectedValueOnce({ code: "P2025" } as never);

      const result = await waitlistService.cancel("missing");

      expect(result).toBeNull();
      expect(prisma.waitlistEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("markNotified", () => {
    it("records notified status, notifiedAt and expiresAt only from waiting, then recalculates positions", async () => {
      const notified = makeEntry({ status: "notified" });
      vi.mocked(prisma.waitlistEntry.update).mockResolvedValueOnce(notified as never);
      vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValueOnce([] as never);

      const result = await waitlistService.markNotified("wl-1");

      expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: "wl-1", status: "waiting" },
        data: {
          status: "notified",
          notifiedAt: expect.any(Date),
          expiresAt: expect.any(Date),
        },
      });
      const { data } = vi.mocked(prisma.waitlistEntry.update).mock.calls[0]![0] as {
        data: { notifiedAt: Date; expiresAt: Date };
      };
      expect(data.expiresAt.getTime() - data.notifiedAt.getTime()).toBe(5 * 60 * 1000);
      expect(prisma.waitlistEntry.findMany).toHaveBeenCalled();
      expect(result).toEqual(notified);
    });

    it("returns null when the entry is no longer waiting", async () => {
      vi.mocked(prisma.waitlistEntry.update).mockRejectedValueOnce(new Error("not found"));
      expect(await waitlistService.markNotified("wl-1")).toBeNull();
      expect(prisma.waitlistEntry.findMany).not.toHaveBeenCalled();
    });
  });

  describe("revertNotified", () => {
    it("puts a notified entry back to waiting, clears timestamps, recalculates positions", async () => {
      const waiting = makeEntry({ status: "waiting" });
      vi.mocked(prisma.waitlistEntry.update).mockResolvedValueOnce(waiting as never);
      vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValueOnce([] as never);

      const result = await waitlistService.revertNotified("wl-1");

      expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: "wl-1", status: "notified" },
        data: { status: "waiting", notifiedAt: null, expiresAt: null },
      });
      expect(prisma.waitlistEntry.findMany).toHaveBeenCalled();
      expect(result).toEqual(waiting);
    });

    it("returns null when the entry is no longer notified", async () => {
      vi.mocked(prisma.waitlistEntry.update).mockRejectedValueOnce(new Error("not found"));
      expect(await waitlistService.revertNotified("wl-1")).toBeNull();
    });
  });

  describe("recalculation keeps estimates in step with position", () => {
    it("rewrites estimated_wait_minutes (position x turn time) alongside position", async () => {
      vi.mocked(prisma.waitlistEntry.update).mockResolvedValueOnce(
        makeEntry({ status: "seated" }) as never
      );
      vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValueOnce([
        { id: "wl-3", position: 3 },
      ] as never);

      await waitlistService.seat("wl-1");

      const sqlTexts = vi
        .mocked(prisma.$executeRaw)
        .mock.calls.map((call) => (call[0] as unknown as string[]).join("?"));
      expect(sqlTexts.some((t) => t.includes("estimated_wait_minutes"))).toBe(true);
    });
  });

  describe("expire", () => {
    it("marks the entry expired without recalculating positions", async () => {
      const expired = makeEntry({ status: "expired" });
      vi.mocked(prisma.waitlistEntry.update).mockResolvedValueOnce(expired as never);

      const result = await waitlistService.expire("wl-1");

      expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: "wl-1", status: "notified" },
        data: { status: "expired" },
      });
      expect(result).toEqual(expired);
      expect(prisma.waitlistEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("is a no-op (null) when the entry was already seated or cancelled", async () => {
      vi.mocked(prisma.waitlistEntry.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await waitlistService.expire("wl-seated")).toBeNull();
    });
  });
});
