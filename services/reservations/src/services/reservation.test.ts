/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    venue: {
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
}));

vi.mock("./availability.js", () => ({
  availabilityService: {
    checkConflict: vi.fn(),
    checkPacing: vi.fn(),
    estimateDuration: vi.fn(),
    findBestTable: vi.fn(),
  },
}));

import { reservationService } from "./reservation.js";
import { prisma } from "./database.js";
import { availabilityService } from "./availability.js";

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
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.checkPacing).mockResolvedValueOnce({
        withinLimit: true,
        currentCovers: 0,
        maxCovers: 20,
      } as never);
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
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: true,
        conflictingReservationId: "res-other",
      } as never);

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
    });

    it("returns failure when pacing limit exceeded", async () => {
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: { pacingRules: [{ maxCoversPerSlot: 10 }] },
      } as never);
      vi.mocked(availabilityService.checkPacing).mockResolvedValueOnce({
        withinLimit: false,
        currentCovers: 9,
        maxCovers: 10,
      } as never);

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

    it("skips pacing check when venueId not provided", async () => {
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);
      vi.mocked(prisma.reservation.create).mockResolvedValueOnce(makePrismaReservation() as never);

      const result = await reservationService.createWithConflictCheck({
        date: "2026-05-05",
        startTime: "2026-05-05T18:00:00Z",
        endTime: "2026-05-05T19:30:00Z",
        partySize: 2,
        tableId: "table-1",
      });

      expect(result.success).toBe(true);
      expect(prisma.venue.findUnique).not.toHaveBeenCalled();
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
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ status: "CONFIRMED" }) as never
      );

      const result = await reservationService.update("res-1", {
        status: "CONFIRMED",
      });

      expect(result!.status).toBe("CONFIRMED");
    });

    it("updates status to COMPLETED", async () => {
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ status: "COMPLETED" }) as never
      );

      const result = await reservationService.update("res-1", {
        status: "COMPLETED",
      });

      expect(result!.status).toBe("COMPLETED");
    });

    it("updates status to NO_SHOW", async () => {
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
      expect(availabilityService.checkConflict).not.toHaveBeenCalled();
    });

    it("performs conflict check when time changes", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ startTime: new Date("2026-05-05T19:00:00Z") }) as never
      );

      const result = await reservationService.updateWithConflictCheck("res-1", {
        startTime: "2026-05-05T19:00:00Z",
      });

      expect(result.success).toBe(true);
      expect(availabilityService.checkConflict).toHaveBeenCalled();
    });

    it("performs conflict check when tableId changes", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(
        makePrismaReservation({ tableId: "table-2" }) as never
      );

      const result = await reservationService.updateWithConflictCheck("res-1", {
        tableId: "table-2",
      });

      expect(result.success).toBe(true);
    });

    it("returns failure when time change creates conflict", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: true,
        conflictingReservationId: "res-other",
      } as never);

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

    it("excludes current reservation from conflict check", async () => {
      vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(
        makePrismaReservation() as never
      );
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);
      vi.mocked(prisma.reservation.update).mockResolvedValueOnce(makePrismaReservation() as never);

      await reservationService.updateWithConflictCheck("res-1", {
        date: "2026-05-06",
      });

      expect(availabilityService.checkConflict).toHaveBeenCalledWith(
        "table-1",
        "2026-05-06",
        expect.any(Date),
        expect.any(Date),
        "res-1"
      );
    });
  });

  describe("createWalkIn", () => {
    it("creates walk-in with CONFIRMED status", async () => {
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);

      const walkInReservation = makePrismaReservation({
        status: "CONFIRMED",
        guestName: "Walk-in",
      });
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue(walkInReservation),
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
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
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
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
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

    it("returns failure when table has conflict", async () => {
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: true,
        conflictingReservationId: "res-other",
      } as never);

      const result = await reservationService.createWalkIn({
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Table is not available");
    });

    it("returns failure when conflicting reservation found in transaction", async () => {
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: {
              findFirst: vi.fn().mockResolvedValue({ id: "conflict" }),
              create: vi.fn(),
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
      vi.mocked(availabilityService.checkConflict).mockResolvedValueOnce({
        hasConflict: false,
      } as never);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
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
  });

  describe("cancel", () => {
    it("sets status to CANCELLED", async () => {
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
          guest: { select: { visitCount: true, communicationPreference: true } },
        },
      });
    });

    it("stores cancellation reason and note", async () => {
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

    it("returns null for P2025 (not found)", async () => {
      vi.mocked(prisma.reservation.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await reservationService.cancel("missing")).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      vi.mocked(prisma.reservation.update).mockRejectedValueOnce(new Error("DB error") as never);

      await expect(reservationService.cancel("res-1")).rejects.toThrow("DB error");
    });
  });
});
