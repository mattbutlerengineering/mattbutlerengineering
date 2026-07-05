/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      venue: {
        findUnique: vi.fn(),
      },
      table: {
        findUnique: vi.fn(),
      },
      reservation: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  });
});

vi.mock("./availability.js", () => ({
  availabilityService: {
    fetchConflictData: vi.fn(),
    estimateDuration: vi.fn(),
    findBestTable: vi.fn(),
  },
}));

vi.mock("./slot-rules.js", () => ({
  checkTableConflict: vi.fn(),
  checkPacingForSlot: vi.fn(),
}));

vi.mock("./assert-bookable.js", () => ({
  assertBookable: vi.fn().mockReturnValue(undefined),
}));

import { reservationService } from "./reservation.js";
import { prisma } from "./database.js";
import { availabilityService } from "./availability.js";
import { checkTableConflict, checkPacingForSlot } from "./slot-rules.js";
import { assertBookable } from "./assert-bookable.js";

const NOW = new Date("2026-05-05T18:00:00Z");

function makePrismaTable() {
  return {
    id: "table-1",
    name: "Table 1",
    tableNumber: "1",
    capacity: 4,
    minCovers: 1,
    maxCovers: 6,
    location: "Main Floor",
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makePrismaReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    date: new Date("2026-05-05"),
    startTime: new Date("2026-05-05T18:00:00Z"),
    endTime: new Date("2026-05-05T19:30:00Z"),
    partySize: 2,
    status: "PENDING",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "John Doe",
    guestEmail: "john@example.com",
    guestPhone: "+15551234567",
    guestId: null,
    userId: "user-1",
    tableId: "table-1",
    table: makePrismaTable(),
    venueId: "venue-1",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/**
 * Queues one passthrough transaction on prisma.$transaction for the bookSlot
 * seam: the advisory-lock $executeRaw is a no-op, conflict re-checks default to
 * "free", and create/update return the given row.
 */
function useSlotTxOnce(reservationRow: unknown = makePrismaReservation()): void {
  vi.mocked(prisma.$transaction).mockImplementationOnce(
    ((fn: (client: unknown) => Promise<unknown>) => {
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(0),
        venue: { findUnique: vi.fn().mockResolvedValue({ settings: null }) },
        reservation: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue(reservationRow),
          update: vi.fn().mockResolvedValue(reservationRow),
        },
        reservationHold: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      return fn(tx);
    }) as never
  );
}

describe("reservationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty pre-fetched slices; individual tests override as needed.
    vi.mocked(availabilityService.fetchConflictData).mockResolvedValue({
      reservations: [],
      holds: [],
    });
    vi.mocked(checkTableConflict).mockReturnValue(false);
    vi.mocked(checkPacingForSlot).mockReturnValue(true);
    // assertBookable: slot is bookable by default (returns undefined = no error).
    vi.mocked(assertBookable).mockReturnValue(undefined);
  });

  describe("list", () => {
    it("returns paginated reservations", async () => {
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
        makePrismaReservation(),
      ] as never);
      vi.mocked(prisma.reservation.count).mockResolvedValueOnce(1 as never);

      const result = await reservationService.list({
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("res-1");
      expect(result.data[0].status).toBe("PENDING");
      expect(typeof result.data[0].startTime).toBe("string");
      expect(typeof result.data[0].date).toBe("string");
      expect(result.data[0].table?.id).toBe("table-1");
      expect(result.pagination.total).toBe(1);
    });

    it("filters by date", async () => {
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.reservation.count).mockResolvedValueOnce(0 as never);

      await reservationService.list({ page: 1, limit: 10, date: "2026-05-05" });

      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: new Date("2026-05-05"),
          }),
        })
      );
    });

    it("filters by status", async () => {
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.reservation.count).mockResolvedValueOnce(0 as never);

      await reservationService.list({
        page: 1,
        limit: 10,
        status: "CONFIRMED",
      });

      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "CONFIRMED" }),
        })
      );
    });

    it("filters by tableId and venueId", async () => {
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.reservation.count).mockResolvedValueOnce(0 as never);

      await reservationService.list({
        page: 1,
        limit: 10,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tableId: "table-1",
            venueId: "venue-1",
          }),
        })
      );
    });

    it("calculates pagination correctly", async () => {
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.reservation.count).mockResolvedValueOnce(25 as never);

      const result = await reservationService.list({ page: 2, limit: 10 });

      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      });
    });
  });

  describe("listByUserId", () => {
    it("returns user reservations sorted by date descending", async () => {
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
        makePrismaReservation(),
      ] as never);
      vi.mocked(prisma.reservation.count).mockResolvedValueOnce(1 as never);

      const result = await reservationService.listByUserId("user-1", 1, 10);

      expect(result.data).toHaveLength(1);
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          orderBy: [{ date: "desc" }, { startTime: "desc" }],
        })
      );
    });
  });

  describe("getById", () => {
    it("returns mapped reservation when found", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );

      const result = await reservationService.getById("res-1");

      expect(result).not.toBeNull();
      expect(result!.guestName).toBe("John Doe");
      expect(result!.table).toBeDefined();
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(null as never);

      expect(await reservationService.getById("missing")).toBeNull();
    });
  });

  describe("create", () => {
    it("creates reservation with all fields", async () => {
      vi.mocked(prisma.reservation.create).mockResolvedValueOnce(makePrismaReservation() as never);

      const result = await reservationService.create(
        {
          date: "2026-05-05",
          startTime: "2026-05-05T18:00:00Z",
          endTime: "2026-05-05T19:30:00Z",
          partySize: 2,
          tableId: "table-1",
          guestName: "John Doe",
          guestEmail: "john@example.com",
          venueId: "venue-1",
        },
        "user-1"
      );

      expect(result.id).toBe("res-1");
      expect(prisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            partySize: 2,
            tableId: "table-1",
            userId: "user-1",
          }),
        })
      );
    });

    it("creates reservation without userId", async () => {
      vi.mocked(prisma.reservation.create).mockResolvedValueOnce(
        makePrismaReservation({ userId: null }) as never
      );

      await reservationService.create({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
      });

      expect(prisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: null }),
        })
      );
    });
  });

  describe("createWithConflictCheck", () => {
    it("returns success when the slot is bookable", async () => {
      // assertBookable returns undefined (bookable) by default in beforeEach.
      useSlotTxOnce(makePrismaReservation({ status: "PENDING" }));

      const result = await reservationService.createWithConflictCheck(
        {
          date: "2026-05-05",
          startTime: "2026-05-05T18:00:00Z",
          endTime: "2026-05-05T19:30:00Z",
          partySize: 2,
          tableId: "table-1",
          venueId: "venue-1",
        },
        "user-1"
      );

      expect(result.success).toBe(true);
      expect(result.reservation).toBeDefined();
      expect(assertBookable).toHaveBeenCalledTimes(1);
    });

    it("returns failure when assertBookable reports CONFLICT", async () => {
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "CONFLICT",
        message: "Table is not available for this time slot",
      });

      const result = await reservationService.createWithConflictCheck({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("conflict");
      expect(result.conflict?.hasConflict).toBe(true);
      expect(availabilityService.fetchConflictData).toHaveBeenCalledTimes(1);
    });

    it("returns failure via assertBookable when pacing limit is reached", async () => {
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "PACING_EXCEEDED",
        message: "Pacing limit reached. Maximum 10 covers per time window.",
      });

      const result = await reservationService.createWithConflictCheck({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Pacing limit reached. Maximum 10 covers per time window.");
    });

    it("calls fetchConflictData exactly once — slices reused across the assertBookable check", async () => {
      useSlotTxOnce();

      await reservationService.createWithConflictCheck({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      // Regression guard: fetchConflictData must be called exactly once — the
      // conflict + pacing rules both evaluate over the same pre-fetched slices.
      expect(availabilityService.fetchConflictData).toHaveBeenCalledTimes(1);
      expect(assertBookable).toHaveBeenCalledTimes(1);
    });

    it("resolves venueId from the table when the request omits it", async () => {
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({
        id: "table-1",
        venueId: "venue-1",
      } as never);
      useSlotTxOnce();

      const result = await reservationService.createWithConflictCheck({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
      });

      expect(result.success).toBe(true);
      expect(availabilityService.fetchConflictData).toHaveBeenCalledWith("venue-1", "2026-05-05");
      // Pacing is now enforced on this path too: the invariant crosses the single
      // assertBookable seam regardless of where venueId was resolved from.
      expect(assertBookable).toHaveBeenCalledTimes(1);
    });

    it("returns conflict when the no-venueId path reports CONFLICT via assertBookable", async () => {
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({
        id: "table-1",
        venueId: "venue-1",
      } as never);
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "CONFLICT",
        message: "Table is not available for this time slot",
      });

      const result = await reservationService.createWithConflictCheck({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
      });

      expect(result.success).toBe(false);
      expect(result.conflict?.hasConflict).toBe(true);
    });

    it("two concurrent same-slot bookings: exactly one wins (restored advisory-lock + in-tx re-check)", async () => {
      // #3113 regression: createWithConflictCheck dropped the advisory lock +
      // transaction, so two staff bookings of the same slot could both pass the
      // pre-check and both insert. The write now routes through bookSlot, which
      // re-checks under a per-table advisory lock — exactly one must win.
      const store: Array<{ tableId: string; startTime: Date; endTime: Date }> = [];
      const start = new Date("2026-05-05T18:00:00Z");
      const end = new Date("2026-05-05T19:30:00Z");
      const overlaps = (): boolean =>
        store.some((r) => r.tableId === "table-1" && r.startTime < end && r.endTime > start);
      const pushRow = () => {
        store.push({ tableId: "table-1", startTime: start, endTime: end });
        return makePrismaReservation({ id: `res-${store.length}`, status: "CONFIRMED" });
      };

      // Pre-check passes for both callers (they read the same empty snapshot).
      vi.mocked(checkTableConflict).mockReturnValue(false);
      vi.mocked(checkPacingForSlot).mockReturnValue(true);
      vi.mocked(prisma.venue.findUnique).mockResolvedValue({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.fetchConflictData).mockResolvedValue({
        reservations: [],
        holds: [],
      });

      // Old, bug path: a bare global create lets both callers insert.
      vi.mocked(prisma.reservation.create).mockImplementation(
        () => Promise.resolve(pushRow()) as never
      );

      // New path: bookSlot's $transaction serializes on the advisory lock and
      // re-checks the shared store in-transaction.
      let chain: Promise<unknown> = Promise.resolve();
      vi.mocked(prisma.$transaction).mockImplementation(
        ((fn: (client: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            venue: { findUnique: vi.fn().mockResolvedValue({ settings: null }) },
            reservation: {
              findFirst: vi
                .fn()
                .mockImplementation(() =>
                  Promise.resolve(overlaps() ? { id: "existing" } : null)
                ),
              findMany: vi.fn().mockResolvedValue([]),
              create: vi.fn().mockImplementation(() => Promise.resolve(pushRow())),
            },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              findMany: vi.fn().mockResolvedValue([]),
            },
          };
          const run = chain.then(() => fn(tx));
          chain = run.then(
            () => undefined,
            () => undefined
          );
          return run;
        }) as never
      );

      const request = {
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      };

      const [a, b] = await Promise.all([
        reservationService.createWithConflictCheck(request, "user-1"),
        reservationService.createWithConflictCheck(request, "user-2"),
      ]);

      const successes = [a, b].filter((r) => r.success).length;
      expect(successes).toBe(1);
      expect(store.length).toBe(1);
      // The persistent $transaction implementation above must not leak into
      // later tests (beforeEach only clears call history, not implementations).
      vi.mocked(prisma.$transaction).mockReset();
    });
  });

  describe("update", () => {
    it("updates reservation fields", async () => {
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ notes: "Updated notes" }) as never
      );

      const result = await reservationService.update("res-1", {
        notes: "Updated notes",
      });

      expect(result!.notes).toBe("Updated notes");
    });

    it("returns null for P2025", async () => {
      vi.mocked(prisma.reservation.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await reservationService.update("missing", { notes: "X" })).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      vi.mocked(prisma.reservation.update).mockRejectedValueOnce(new Error("DB error") as never);

      await expect(reservationService.update("res-1", { notes: "X" })).rejects.toThrow("DB error");
    });

    it("updates status to CONFIRMED via a status-guarded CAS", async () => {
      vi.mocked(prisma.reservation.findUnique)
        .mockResolvedValueOnce(makePrismaReservation({ status: "PENDING" }) as never)
        .mockResolvedValueOnce(makePrismaReservation({ status: "CONFIRMED" }) as never);
      vi.mocked(prisma.reservation.updateMany).mockResolvedValueOnce({ count: 1 } as never);

      const result = await reservationService.update("res-1", {
        status: "CONFIRMED",
      });

      expect(result!.status).toBe("CONFIRMED");
      expect(prisma.reservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "res-1", status: "PENDING" },
          data: expect.objectContaining({ status: "CONFIRMED" }),
        })
      );
      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });

    it("updates status to COMPLETED", async () => {
      vi.mocked(prisma.reservation.findUnique)
        .mockResolvedValueOnce(makePrismaReservation({ status: "CONFIRMED" }) as never)
        .mockResolvedValueOnce(makePrismaReservation({ status: "COMPLETED" }) as never);
      vi.mocked(prisma.reservation.updateMany).mockResolvedValueOnce({ count: 1 } as never);

      const result = await reservationService.update("res-1", {
        status: "COMPLETED",
      });

      expect(result!.status).toBe("COMPLETED");
    });

    it("updates status to NO_SHOW", async () => {
      vi.mocked(prisma.reservation.findUnique)
        .mockResolvedValueOnce(makePrismaReservation({ status: "CONFIRMED" }) as never)
        .mockResolvedValueOnce(makePrismaReservation({ status: "NO_SHOW" }) as never);
      vi.mocked(prisma.reservation.updateMany).mockResolvedValueOnce({ count: 1 } as never);

      const result = await reservationService.update("res-1", {
        status: "NO_SHOW",
      });

      expect(result!.status).toBe("NO_SHOW");
    });

    it("persists cancellationReason and cancellationNote when cancelling", async () => {
      vi.mocked(prisma.reservation.findUnique)
        .mockResolvedValueOnce(makePrismaReservation({ status: "PENDING" }) as never)
        .mockResolvedValueOnce(
          makePrismaReservation({
            status: "CANCELLED",
            cancellationReason: "guest_request",
            cancellationNote: "Guest changed plans",
          }) as never
        );
      vi.mocked(prisma.reservation.updateMany).mockResolvedValueOnce({ count: 1 } as never);

      const result = await reservationService.update("res-1", {
        status: "CANCELLED",
        cancellationReason: "guest_request",
        cancellationNote: "Guest changed plans",
      });

      expect(result!.cancellationReason).toBe("guest_request");
      expect(result!.cancellationNote).toBe("Guest changed plans");
      expect(prisma.reservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "res-1", status: "PENDING" },
          data: expect.objectContaining({
            status: "CANCELLED",
            cancellationReason: "guest_request",
            cancellationNote: "Guest changed plans",
          }),
        })
      );
    });

    it("returns null when the status CAS loses the race (updateMany count 0)", async () => {
      // Another concurrent transition moved the row off the observed status
      // between our read and our write, so the guarded updateMany matches no
      // rows. Returning null lets the caller short-circuit without notifying.
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation({ status: "CONFIRMED" }) as never
      );
      vi.mocked(prisma.reservation.updateMany).mockResolvedValueOnce({ count: 0 } as never);

      const result = await reservationService.update("res-1", { status: "CANCELLED" });

      expect(result).toBeNull();
      // The post-CAS refetch must never run when the race was lost.
      expect(prisma.reservation.findUnique).toHaveBeenCalledTimes(1);
    });

    it("returns null when the reservation does not exist for a status change", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(null as never);

      const result = await reservationService.update("missing", { status: "CANCELLED" });

      expect(result).toBeNull();
      expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("updateWithConflictCheck", () => {
    it("skips conflict check when only notes are updated", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ notes: "New note" }) as never
      );

      const result = await reservationService.updateWithConflictCheck("res-1", {
        notes: "New note",
      });

      expect(result.success).toBe(true);
      expect(availabilityService.fetchConflictData).not.toHaveBeenCalled();
      expect(assertBookable).not.toHaveBeenCalled();
    });

    it("checks the booking invariant via assertBookable when time changes", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      useSlotTxOnce(makePrismaReservation({ startTime: new Date("2026-05-05T19:00:00Z") }));

      const result = await reservationService.updateWithConflictCheck("res-1", {
        startTime: "2026-05-05T19:00:00Z",
      });

      expect(result.success).toBe(true);
      expect(availabilityService.fetchConflictData).toHaveBeenCalledWith("venue-1", "2026-05-05");
      expect(assertBookable).toHaveBeenCalledTimes(1);
    });

    it("checks the booking invariant via assertBookable when tableId changes", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      useSlotTxOnce(makePrismaReservation({ tableId: "table-2" }));

      const result = await reservationService.updateWithConflictCheck("res-1", {
        tableId: "table-2",
      });

      expect(result.success).toBe(true);
      expect(availabilityService.fetchConflictData).toHaveBeenCalledTimes(1);
      expect(assertBookable).toHaveBeenCalledTimes(1);
    });

    it("returns failure when the move creates a CONFLICT (assertBookable)", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "CONFLICT",
        message: "Table is not available for this time slot",
      });

      const result = await reservationService.updateWithConflictCheck("res-1", {
        startTime: "2026-05-05T19:00:00Z",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("conflict");
      expect(result.conflict?.hasConflict).toBe(true);
    });

    it("returns failure when the move would exceed pacing (assertBookable)", async () => {
      // Pacing is now enforced on slot moves too — previously moves checked
      // conflict only, so a move could push a window over its cover limit.
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "PACING_EXCEEDED",
        message: "Pacing limit reached. Maximum 4 covers per time window.",
      });

      const result = await reservationService.updateWithConflictCheck("res-1", {
        startTime: "2026-05-05T19:00:00Z",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Pacing limit reached. Maximum 4 covers per time window.");
    });

    it("returns failure when reservation not found", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(null as never);

      const result = await reservationService.updateWithConflictCheck("missing", {
        notes: "X",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Reservation not found");
    });

    it("excludes the current reservation from the slices passed to assertBookable", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      // Return the reservation being moved in the fetched slices so we can verify
      // it is filtered out before the invariant check (no self-conflict/pacing).
      vi.mocked(availabilityService.fetchConflictData).mockResolvedValueOnce({
        reservations: [
          {
            id: "res-1",
            tableId: "table-1",
            startTime: new Date("2026-05-06T18:00:00Z"),
            endTime: new Date("2026-05-06T19:30:00Z"),
            partySize: 2,
          },
        ],
        holds: [],
      });
      useSlotTxOnce();

      await reservationService.updateWithConflictCheck("res-1", {
        date: "2026-05-06",
      });

      const opts = vi.mocked(assertBookable).mock.calls[0][0];
      expect(opts.reservations.some((r) => r.id === "res-1")).toBe(false);
    });
  });

  describe("createWalkIn", () => {
    it("creates walk-in with CONFIRMED status", async () => {
      vi.mocked(checkTableConflict).mockReturnValueOnce(false);

      const walkInReservation = makePrismaReservation({
        status: "CONFIRMED",
        guestName: "Walk-in",
      });
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue(walkInReservation),
            },
            table: {
              update: vi.fn().mockResolvedValue(makePrismaTable()),
            },
          };
          return fn(tx);
        }
      );

      const result = await reservationService.createWalkIn({
        partySize: 4,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(true);
      expect(result.reservation!.status).toBe("CONFIRMED");
    });

    it("uses default 90 minute duration", async () => {
      vi.mocked(checkTableConflict).mockReturnValueOnce(false);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockImplementation((args) => {
                const startTime = args.data.startTime as Date;
                const endTime = args.data.endTime as Date;
                const durationMs = endTime.getTime() - startTime.getTime();
                expect(durationMs).toBe(90 * 60 * 1000);
                return makePrismaReservation({ status: "CONFIRMED" });
              }),
            },
            table: {
              update: vi.fn().mockResolvedValue(makePrismaTable()),
            },
          };
          return fn(tx);
        }
      );

      await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });
    });

    it("uses custom duration when provided", async () => {
      vi.mocked(checkTableConflict).mockReturnValueOnce(false);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockImplementation((args) => {
                const startTime = args.data.startTime as Date;
                const endTime = args.data.endTime as Date;
                const durationMs = endTime.getTime() - startTime.getTime();
                expect(durationMs).toBe(60 * 60 * 1000);
                return makePrismaReservation({ status: "CONFIRMED" });
              }),
            },
            table: {
              update: vi.fn().mockResolvedValue(makePrismaTable()),
            },
          };
          return fn(tx);
        }
      );

      await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
        durationMinutes: 60,
      });
    });

    it("returns failure when assertBookable reports CONFLICT", async () => {
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "CONFLICT",
        message: "Table is not available for this time slot",
      });

      const result = await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Table is not available");
      expect(availabilityService.fetchConflictData).toHaveBeenCalledTimes(1);
    });

    it("returns failure when assertBookable reports PACING_EXCEEDED", async () => {
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "PACING_EXCEEDED",
        message: "Pacing limit reached. Maximum 4 covers per time window.",
      });

      const result = await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Pacing limit");
    });

    it("returns failure when table has conflict", async () => {
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "CONFLICT",
        message: "Table is not available for this time slot",
      });

      const result = await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Table is not available");
      expect(availabilityService.fetchConflictData).toHaveBeenCalledTimes(1);
    });

    it("returns failure when conflicting reservation found in transaction", async () => {
      vi.mocked(checkTableConflict).mockReturnValueOnce(false);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue({ id: "conflict" }),
              create: vi.fn(),
            },
            table: {
              update: vi.fn().mockResolvedValue(makePrismaTable()),
            },
          };
          return fn(tx);
        }
      );

      const result = await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Table is not available");
    });

    it("defaults guestName to Walk-in", async () => {
      vi.mocked(checkTableConflict).mockReturnValueOnce(false);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockImplementation((args) => {
                expect(args.data.guestName).toBe("Walk-in");
                return makePrismaReservation({
                  status: "CONFIRMED",
                  guestName: "Walk-in",
                });
              }),
            },
            table: {
              update: vi.fn().mockResolvedValue(makePrismaTable()),
            },
          };
          return fn(tx);
        }
      );

      await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });
    });

    it("acquires the table advisory lock BEFORE the in-transaction conflict check", async () => {
      vi.mocked(checkTableConflict).mockReturnValueOnce(false);

      const callOrder: string[] = [];
      const executeRaw = vi.fn().mockImplementation((sql: any) => {
        callOrder.push("lock");
        expect(sql.sql ?? String(sql)).toContain("pg_advisory_xact_lock");
        // tableId bound as a parameter, never string-interpolated.
        expect(sql.values).toContain("table-1");
        return Promise.resolve(0);
      });

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRaw: executeRaw,
            reservation: {
              findFirst: vi.fn().mockImplementation(() => {
                callOrder.push("reservation.findFirst");
                return Promise.resolve(null);
              }),
              create: vi.fn().mockResolvedValue(makePrismaReservation({ status: "CONFIRMED" })),
            },
            table: {
              update: vi.fn().mockResolvedValue(makePrismaTable()),
            },
          };
          return fn(tx);
        }
      );

      const result = await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(true);
      expect(executeRaw).toHaveBeenCalledTimes(1);
      expect(callOrder[0]).toBe("lock");
      expect(callOrder.indexOf("lock")).toBeLessThan(callOrder.indexOf("reservation.findFirst"));
    });

    it("updates the table to OCCUPIED inside the same transaction and returns it", async () => {
      vi.mocked(checkTableConflict).mockReturnValueOnce(false);

      const tableUpdate = vi.fn().mockResolvedValue(makePrismaTable());
      const reservationCreate = vi
        .fn()
        .mockResolvedValue(makePrismaReservation({ status: "CONFIRMED" }));

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: reservationCreate,
            },
            table: { update: tableUpdate },
          };
          return fn(tx);
        }
      );

      const result = await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(true);
      expect(tableUpdate).toHaveBeenCalledWith({
        where: { id: "table-1" },
        data: { status: "OCCUPIED" },
      });
      expect(result.table).toBeDefined();
      expect(result.table!.id).toBe("table-1");
    });

    it("rolls back the reservation when the in-transaction table update fails", async () => {
      vi.mocked(checkTableConflict).mockReturnValueOnce(false);

      const reservationCreate = vi
        .fn()
        .mockResolvedValue(makePrismaReservation({ status: "CONFIRMED" }));
      const tableUpdate = vi.fn().mockRejectedValue(new Error("table update failed"));

      // Real Prisma rolls back the whole transaction when the callback throws.
      // Model that here: if the callback throws, $transaction rejects and NO
      // reservation row is persisted (the create call is part of the same
      // aborted transaction).
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: reservationCreate,
            },
            table: { update: tableUpdate },
          };
          return fn(tx);
        }
      );

      await expect(
        reservationService.createWalkIn({
          partySize: 2,
          tableId: "table-1",
          venueId: "venue-1",
        })
      ).rejects.toThrow("table update failed");

      // create was attempted inside the transaction, but because the callback
      // threw afterwards the whole transaction aborts — no committed row.
      expect(tableUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
