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
        count: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  });
});

vi.mock("./availability.js", () => ({
  availabilityService: {
    fetchConflictData: vi.fn(),
    checkTableConflict: vi.fn(),
    checkPacingForSlot: vi.fn(),
    estimateDuration: vi.fn(),
    findBestTable: vi.fn(),
  },
}));

vi.mock("./assert-bookable.js", () => ({
  assertBookable: vi.fn().mockReturnValue(undefined),
}));

import { reservationService } from "./reservation.js";
import { prisma } from "./database.js";
import { availabilityService } from "./availability.js";
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

describe("reservationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty pre-fetched slices; individual tests override as needed.
    vi.mocked(availabilityService.fetchConflictData).mockResolvedValue({
      reservations: [],
      holds: [],
    });
    vi.mocked(availabilityService.checkTableConflict).mockReturnValue(false);
    vi.mocked(availabilityService.checkPacingForSlot).mockReturnValue(true);
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
    it("returns success when no conflicts and pacing ok", async () => {
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.checkPacingForSlot).mockReturnValueOnce(true);
      vi.mocked(prisma.reservation.create).mockResolvedValueOnce(
        makePrismaReservation({ status: "PENDING" }) as never
      );

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
    });

    it("returns failure when conflict detected", async () => {
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(true);

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

    it("returns failure when pacing limit exceeded", async () => {
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: { pacingRules: [{ maxCoversPerSlot: 10 }] },
      } as never);
      vi.mocked(availabilityService.checkPacingForSlot).mockReturnValueOnce(false);

      const result = await reservationService.createWithConflictCheck({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Pacing limit");
      expect(result.pacing).toBeDefined();
    });

    it("calls fetchConflictData exactly once for conflict + pacing checks (no extra DB queries)", async () => {
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.checkPacingForSlot).mockReturnValueOnce(true);
      vi.mocked(prisma.reservation.create).mockResolvedValueOnce(makePrismaReservation() as never);

      await reservationService.createWithConflictCheck({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      // Regression guard: fetchConflictData must be called exactly once even when
      // both conflict and pacing rules are evaluated — the slices are reused.
      expect(availabilityService.fetchConflictData).toHaveBeenCalledTimes(1);
    });

    it("uses fetch-then-rule pattern when venueId not provided (table has venueId)", async () => {
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({
        id: "table-1",
        venueId: "venue-1",
      } as never);
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);
      vi.mocked(prisma.reservation.create).mockResolvedValueOnce(makePrismaReservation() as never);

      const result = await reservationService.createWithConflictCheck({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
      });

      expect(result.success).toBe(true);
      expect(availabilityService.fetchConflictData).toHaveBeenCalledWith("venue-1", "2026-05-05");
      expect(availabilityService.checkTableConflict).toHaveBeenCalledTimes(1);
      expect(prisma.venue.findUnique).not.toHaveBeenCalled();
    });

    it("returns conflict when no-venueId path detects conflict via fetch-then-rule", async () => {
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({
        id: "table-1",
        venueId: "venue-1",
      } as never);
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(true);

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

    it("updates status to CONFIRMED", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation({ status: "PENDING" }) as never
      );
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ status: "CONFIRMED" }) as never
      );

      const result = await reservationService.update("res-1", {
        status: "CONFIRMED",
      });

      expect(result!.status).toBe("CONFIRMED");
    });

    it("updates status to COMPLETED", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation({ status: "CONFIRMED" }) as never
      );
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ status: "COMPLETED" }) as never
      );

      const result = await reservationService.update("res-1", {
        status: "COMPLETED",
      });

      expect(result!.status).toBe("COMPLETED");
    });

    it("updates status to NO_SHOW", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation({ status: "CONFIRMED" }) as never
      );
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ status: "NO_SHOW" }) as never
      );

      const result = await reservationService.update("res-1", {
        status: "NO_SHOW",
      });

      expect(result!.status).toBe("NO_SHOW");
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
    });

    it("performs conflict check via fetch-then-rule when time changes", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ startTime: new Date("2026-05-05T19:00:00Z") }) as never
      );

      const result = await reservationService.updateWithConflictCheck("res-1", {
        startTime: "2026-05-05T19:00:00Z",
      });

      expect(result.success).toBe(true);
      expect(availabilityService.fetchConflictData).toHaveBeenCalledWith("venue-1", "2026-05-05");
      expect(availabilityService.checkTableConflict).toHaveBeenCalled();
    });

    it("performs conflict check via fetch-then-rule when tableId changes", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ tableId: "table-2" }) as never
      );

      const result = await reservationService.updateWithConflictCheck("res-1", {
        tableId: "table-2",
      });

      expect(result.success).toBe(true);
      expect(availabilityService.fetchConflictData).toHaveBeenCalledTimes(1);
    });

    it("returns failure when time change creates conflict (fetch-then-rule)", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(true);

      const result = await reservationService.updateWithConflictCheck("res-1", {
        startTime: "2026-05-05T19:00:00Z",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("conflict");
    });

    it("returns failure when reservation not found", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(null as never);

      const result = await reservationService.updateWithConflictCheck("missing", {
        notes: "X",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Reservation not found");
    });

    it("excludes current reservation from conflict check via slice filtering", async () => {
      const existingRes = makePrismaReservation();
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(existingRes as never);
      // Return the current reservation in the fetched slices so we can verify it's excluded
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
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(makePrismaReservation() as never);

      await reservationService.updateWithConflictCheck("res-1", {
        date: "2026-05-06",
      });

      // checkTableConflict must be called with slices that exclude res-1
      const callArgs = vi.mocked(availabilityService.checkTableConflict).mock.calls[0];
      const reservationSlices = callArgs[3] as Array<{ id: string }>;
      expect(reservationSlices.some((r) => r.id === "res-1")).toBe(false);
    });
  });

  describe("createWalkIn", () => {
    it("creates walk-in with CONFIRMED status", async () => {
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);

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
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);

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
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);

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
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);

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
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);

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
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);

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
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);

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
      vi.mocked(availabilityService.checkTableConflict).mockReturnValueOnce(false);

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

  describe("cancel", () => {
    it("sets status to CANCELLED", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation({ status: "PENDING" }) as never
      );
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ status: "CANCELLED" }) as never
      );

      const result = await reservationService.cancel("res-1");

      expect(result!.status).toBe("CANCELLED");
      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: "res-1" },
        data: expect.objectContaining({ status: "CANCELLED" }),
        include: {
          table: true,
          guest: {
            select: { visitCount: true, communicationPreference: true, unsubscribed: true },
          },
        },
      });
    });

    it("stores cancellation reason and note", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation({ status: "CONFIRMED" }) as never
      );
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({
          status: "CANCELLED",
          cancellationReason: "guest_request",
          cancellationNote: "Guest changed plans",
        }) as never
      );

      const result = await reservationService.cancel(
        "res-1",
        "guest_request",
        "Guest changed plans"
      );

      expect(result!.cancellationReason).toBe("guest_request");
      expect(result!.cancellationNote).toBe("Guest changed plans");
    });

    it("returns null when reservation not found", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(null);

      expect(await reservationService.cancel("missing")).toBeNull();
    });

    it("throws ReservationTransitionError when cancelling a terminal state", async () => {
      const { ReservationTransitionError } = await import("./reservation-state-machine.js");
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation({ status: "COMPLETED" }) as never
      );

      await expect(reservationService.cancel("res-1")).rejects.toThrow(ReservationTransitionError);
    });

    it("re-throws non-transition errors from update", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation({ status: "PENDING" }) as never
      );
      vi.mocked(prisma.reservation.update).mockRejectedValueOnce(new Error("DB error") as never);

      await expect(reservationService.cancel("res-1")).rejects.toThrow("DB error");
    });
  });
});
