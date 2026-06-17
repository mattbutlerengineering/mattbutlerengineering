/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      venue: {
        findUnique: vi.fn(),
      },
      reservationHold: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      reservation: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  });
});

vi.mock("./events.js", () => ({
  emitHoldConfirmed: vi.fn(),
}));

vi.mock("./availability.js", () => ({
  availabilityService: {
    fetchConflictData: vi.fn(),
  },
  checkPacingForSlot: vi.fn().mockReturnValue(true),
}));

vi.mock("./assert-bookable.js", () => ({
  assertBookable: vi.fn().mockReturnValue(undefined),
}));

import { confirmHold } from "./confirm-hold.js";
import { prisma } from "./database.js";
import { emitHoldConfirmed } from "./events.js";
import { availabilityService, checkPacingForSlot } from "./availability.js";
import { assertBookable } from "./assert-bookable.js";

const NOW = new Date("2026-05-05T18:00:00Z");
const TEN_MIN_FROM_NOW = new Date(NOW.getTime() + 10 * 60 * 1000);
const FIVE_MIN_AGO = new Date(NOW.getTime() - 5 * 60 * 1000);

function makePrismaHold(overrides: Record<string, unknown> = {}) {
  return {
    id: "hold-1",
    venueId: "venue-1",
    tableId: "table-1",
    date: new Date("2026-05-05"),
    startTime: new Date("2026-05-05T22:00:00Z"),
    endTime: new Date("2026-05-05T23:30:00Z"),
    partySize: 2,
    sessionId: "session-abc",
    expiresAt: TEN_MIN_FROM_NOW,
    createdAt: NOW,
    ...overrides,
  };
}

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

/**
 * Builds a minimal transaction client mock for use in $transaction tests.
 * The in-tx pacing re-check calls reservation.findMany, reservationHold.findMany,
 * and venue.findUnique — all default to empty/null so the pacing check passes.
 */
function makeTxMock(overrides: Record<string, unknown> = {}) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    venue: {
      findUnique: vi.fn().mockResolvedValue({ settings: null }),
    },
    reservation: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    reservationHold: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function makeReservationResult(hold: ReturnType<typeof makePrismaHold>) {
  const table = makePrismaTable();
  return {
    id: "res-1",
    date: hold.date,
    startTime: hold.startTime,
    endTime: hold.endTime,
    partySize: hold.partySize,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: hold.tableId,
    table,
    venueId: hold.venueId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("confirmHold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    // Default: venue with no pacing rules — pacing check passes by default.
    vi.mocked(prisma.venue.findUnique).mockResolvedValue({
      id: "venue-1",
      settings: null,
    } as never);
    vi.mocked(availabilityService.fetchConflictData).mockResolvedValue({
      reservations: [],
      holds: [],
    });
    // assertBookable: no booking errors by default (slot is free).
    vi.mocked(assertBookable).mockReturnValue(undefined);
    // checkPacingForSlot: pacing passes by default (used in in-tx re-check).
    vi.mocked(checkPacingForSlot).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Slice 1: Happy path", () => {
    it("converts a valid hold to a reservation and emits hold:confirmed event", async () => {
      const hold = makePrismaHold();
      const reservation = makeReservationResult(hold);

      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock({
            reservation: {
              ...makeTxMock().reservation,
              create: vi.fn().mockResolvedValue(reservation),
            },
          });
          return fn(tx);
        }
      );

      const result = await confirmHold({
        holdId: "hold-1",
        sessionId: "session-abc",
        guestDetails: { guestName: "Jane Doe", guestEmail: "jane@example.com" },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reservation.id).toBe("res-1");
        expect(result.reservation.status).toBe("CONFIRMED");
        expect(result.reservation.guestName).toBe("Jane Doe");
      }

      expect(emitHoldConfirmed).toHaveBeenCalledTimes(1);
      expect(emitHoldConfirmed).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }));
    });
  });

  describe("Slice 2: Hold not found", () => {
    it("returns NOT_FOUND when hold does not exist", async () => {
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(null as never);

      const result = await confirmHold({
        holdId: "missing",
        guestDetails: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe("NOT_FOUND");
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("Slice 3: Hold expired", () => {
    it("returns EXPIRED and deletes expired hold inside the transaction (no reservation created)", async () => {
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(
        makePrismaHold({ expiresAt: FIVE_MIN_AGO }) as never
      );

      const holdDelete = vi.fn().mockResolvedValue(undefined);
      const reservationCreate = vi.fn();

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock({
            reservation: { ...makeTxMock().reservation, create: reservationCreate },
            reservationHold: { ...makeTxMock().reservationHold, delete: holdDelete },
          });
          return fn(tx);
        }
      );

      const result = await confirmHold({
        holdId: "hold-1",
        guestDetails: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe("EXPIRED");
        expect(result.error).toContain("expired");
      }

      // Expired hold deleted, but NO reservation created and no event emitted.
      expect(holdDelete).toHaveBeenCalledWith({ where: { id: "hold-1" } });
      expect(reservationCreate).not.toHaveBeenCalled();
      expect(emitHoldConfirmed).not.toHaveBeenCalled();
    });
  });

  describe("Slice 8: Advisory lock serializes conflict-checked writes", () => {
    it("acquires the table advisory lock BEFORE any conflict check", async () => {
      const hold = makePrismaHold();
      const reservation = makeReservationResult(hold);

      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);

      const callOrder: string[] = [];
      const executeRaw = vi.fn().mockImplementation((sql: any) => {
        callOrder.push("lock");
        // The SQL must take the advisory lock keyed on the table id, and must
        // bind tableId as a parameter (never string-interpolated).
        expect(sql.sql ?? String(sql)).toContain("pg_advisory_xact_lock");
        expect(sql.values).toContain("table-1");
        return Promise.resolve(0);
      });
      const reservationFindFirst = vi.fn().mockImplementation(() => {
        callOrder.push("reservation.findFirst");
        return Promise.resolve(null);
      });
      const holdFindFirst = vi.fn().mockImplementation(() => {
        callOrder.push("hold.findFirst");
        return Promise.resolve(null);
      });

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock({
            $executeRaw: executeRaw,
            reservation: {
              ...makeTxMock().reservation,
              findFirst: reservationFindFirst,
              create: vi.fn().mockResolvedValue(reservation),
            },
            reservationHold: {
              ...makeTxMock().reservationHold,
              findFirst: holdFindFirst,
            },
          });
          return fn(tx);
        }
      );

      const result = await confirmHold({
        holdId: "hold-1",
        sessionId: "session-abc",
        guestDetails: { guestName: "Jane Doe" },
      });

      expect(result.success).toBe(true);
      // Lock acquired first, before BOTH conflict checks.
      expect(executeRaw).toHaveBeenCalledTimes(1);
      expect(callOrder[0]).toBe("lock");
      expect(callOrder.indexOf("lock")).toBeLessThan(callOrder.indexOf("reservation.findFirst"));
      expect(callOrder.indexOf("lock")).toBeLessThan(callOrder.indexOf("hold.findFirst"));
    });
  });

  describe("Slice 4: Session mismatch", () => {
    it("returns SESSION_MISMATCH when sessionId does not match", async () => {
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(makePrismaHold() as never);

      const result = await confirmHold({
        holdId: "hold-1",
        sessionId: "wrong-session",
        guestDetails: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe("SESSION_MISMATCH");
        expect(result.error).toContain("Session");
      }
    });
  });

  describe("Slice 5: Table conflict", () => {
    it("returns CONFLICT and deletes hold when conflicting reservation found", async () => {
      const hold = makePrismaHold();
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock({
            reservation: {
              ...makeTxMock().reservation,
              findFirst: vi.fn().mockResolvedValue({ id: "conflict-res" }),
            },
          });
          return fn(tx);
        }
      );

      const result = await confirmHold({
        holdId: "hold-1",
        sessionId: "session-abc",
        guestDetails: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe("CONFLICT");
      }

      // Event should NOT be emitted on conflict
      expect(emitHoldConfirmed).not.toHaveBeenCalled();
    });

    it("returns CONFLICT when conflicting hold found", async () => {
      const hold = makePrismaHold();
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock({
            reservationHold: {
              ...makeTxMock().reservationHold,
              findFirst: vi.fn().mockResolvedValue({ id: "conflict-hold" }),
            },
          });
          return fn(tx);
        }
      );

      const result = await confirmHold({
        holdId: "hold-1",
        sessionId: "session-abc",
        guestDetails: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe("CONFLICT");
      }
    });
  });

  describe("Slice 6: Public path (no sessionId)", () => {
    it("skips session validation and succeeds when no sessionId provided", async () => {
      const hold = makePrismaHold();
      const reservation = makeReservationResult(hold);

      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock({
            reservation: {
              ...makeTxMock().reservation,
              create: vi.fn().mockResolvedValue(reservation),
            },
          });
          return fn(tx);
        }
      );

      const result = await confirmHold({
        holdId: "hold-1",
        guestDetails: { guestName: "Jane Doe", guestEmail: "jane@example.com" },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reservation.id).toBe("res-1");
      }
    });
  });

  describe("Slice 7: Event emission verification", () => {
    it("emits hold:confirmed with the created reservation", async () => {
      const hold = makePrismaHold();
      const reservation = makeReservationResult(hold);

      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock({
            reservation: {
              ...makeTxMock().reservation,
              create: vi.fn().mockResolvedValue(reservation),
            },
          });
          return fn(tx);
        }
      );

      await confirmHold({
        holdId: "hold-1",
        sessionId: "session-abc",
        guestDetails: { guestName: "Jane Doe" },
      });

      expect(emitHoldConfirmed).toHaveBeenCalledTimes(1);
      // Verify the reservation object passed to the event has the right shape
      const emittedReservation = vi.mocked(emitHoldConfirmed).mock.calls[0][0];
      expect(emittedReservation).toMatchObject({
        id: "res-1",
        status: "CONFIRMED",
        venueId: "venue-1",
      });
    });

    it("does not emit event when confirmation fails", async () => {
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(null as never);

      await confirmHold({
        holdId: "missing",
        guestDetails: {},
      });

      expect(emitHoldConfirmed).not.toHaveBeenCalled();
    });
  });

  describe("Slice 9: Pacing regression — confirm must enforce pacing", () => {
    it("rejects hold confirmation when pacing limit would be exceeded", async () => {
      // Regression: confirm-hold previously skipped pacing entirely.
      // Confirming a hold that would exceed the venue's maxCoversPerSlot must
      // return PACING_EXCEEDED, not create a reservation.
      const hold = makePrismaHold({ partySize: 4 });

      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: { pacingRules: [{ maxCoversPerSlot: 4, timeWindowMinutes: 15 }] },
      } as never);
      vi.mocked(availabilityService.fetchConflictData).mockResolvedValueOnce({
        reservations: [],
        holds: [],
      });
      // assertBookable reports pacing exceeded
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "PACING_EXCEEDED",
        message: "Pacing limit reached. Maximum 4 covers per time window.",
      });

      const result = await confirmHold({
        holdId: "hold-1",
        sessionId: "session-abc",
        guestDetails: { guestName: "Jane Doe" },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe("PACING_EXCEEDED");
      }
      expect(emitHoldConfirmed).not.toHaveBeenCalled();
    });

    it("allows confirmation when pacing limit is not exceeded", async () => {
      const hold = makePrismaHold({ partySize: 2 });
      const reservation = makeReservationResult(hold);

      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: { pacingRules: [{ maxCoversPerSlot: 10, timeWindowMinutes: 15 }] },
      } as never);
      vi.mocked(availabilityService.fetchConflictData).mockResolvedValueOnce({
        reservations: [],
        holds: [],
      });
      // assertBookable: no error (slot is bookable)
      vi.mocked(assertBookable).mockReturnValueOnce(undefined);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock({
            reservation: {
              ...makeTxMock().reservation,
              create: vi.fn().mockResolvedValue(reservation),
            },
          });
          return fn(tx);
        }
      );

      const result = await confirmHold({
        holdId: "hold-1",
        sessionId: "session-abc",
        guestDetails: { guestName: "Jane Doe" },
      });

      expect(result.success).toBe(true);
    });

    it("passes excludeHoldId to assertBookable so the hold does not conflict with itself", async () => {
      const hold = makePrismaHold();

      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.fetchConflictData).mockResolvedValueOnce({
        reservations: [],
        holds: [],
      });
      vi.mocked(assertBookable).mockReturnValueOnce(undefined);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock({
            reservation: {
              ...makeTxMock().reservation,
              create: vi.fn().mockResolvedValue(makeReservationResult(hold)),
            },
          });
          return fn(tx);
        }
      );

      await confirmHold({
        holdId: "hold-1",
        sessionId: "session-abc",
        guestDetails: { guestName: "Jane Doe" },
      });

      expect(assertBookable).toHaveBeenCalledWith(
        expect.objectContaining({ excludeHoldId: "hold-1" })
      );
    });
  });

  describe("Slice 10: In-transaction pacing re-check (TOCTOU close)", () => {
    it("rejects confirmation when in-tx pacing re-check fails even if pre-check passed", async () => {
      // Regression test: two concurrent confirmations on different tables for the
      // same slot can both pass the pre-lock pacing check (TOCTOU). The in-tx
      // re-check under the advisory lock is the authoritative gate.
      const hold = makePrismaHold({ partySize: 4 });
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(hold as never);

      // Pre-check passes (assertBookable returns undefined)
      vi.mocked(assertBookable).mockReturnValueOnce(undefined);

      // In-tx pacing re-check: another concurrent confirmation already committed
      // while we were waiting for the lock, so pacing now fails.
      vi.mocked(checkPacingForSlot).mockReturnValueOnce(false);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = makeTxMock();
          return fn(tx);
        }
      );

      const result = await confirmHold({
        holdId: "hold-1",
        sessionId: "session-abc",
        guestDetails: { guestName: "Jane Doe" },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe("PACING_EXCEEDED");
      }
      expect(emitHoldConfirmed).not.toHaveBeenCalled();
    });
  });
});
