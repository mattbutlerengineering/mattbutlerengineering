/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
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
}));

vi.mock("./events.js", () => ({
  emitHoldConfirmed: vi.fn(),
}));

import { confirmHold } from "./confirm-hold.js";
import { prisma } from "./database.js";
import { emitHoldConfirmed } from "./events.js";

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
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue(reservation),
            },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              delete: vi.fn().mockResolvedValue(undefined),
            },
          };
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
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: reservationCreate,
            },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              delete: holdDelete,
            },
          };
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
          const tx = {
            $executeRaw: executeRaw,
            reservation: {
              findFirst: reservationFindFirst,
              create: vi.fn().mockResolvedValue(reservation),
            },
            reservationHold: {
              findFirst: holdFindFirst,
              delete: vi.fn().mockResolvedValue(undefined),
            },
          };
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
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue({ id: "conflict-res" }),
              create: vi.fn(),
            },
            reservationHold: {
              findFirst: vi.fn(),
              delete: vi.fn().mockResolvedValue(undefined),
            },
          };
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
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn(),
            },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue({ id: "conflict-hold" }),
              delete: vi.fn().mockResolvedValue(undefined),
            },
          };
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
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue(reservation),
            },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              delete: vi.fn().mockResolvedValue(undefined),
            },
          };
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
          const tx = {
            $executeRaw: vi.fn().mockResolvedValue(0),
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue(reservation),
            },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              delete: vi.fn().mockResolvedValue(undefined),
            },
          };
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
});
