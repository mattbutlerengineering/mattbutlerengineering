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
        findFirst: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn(),
      },
      reservation: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  });
});

vi.mock("./availability.js", () => ({
  availabilityService: {
    checkConflict: vi.fn(),
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

import { holdService } from "./hold.js";
import { prisma } from "./database.js";
import { availabilityService } from "./availability.js";
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

describe("holdService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // Default: empty pre-fetched slices; individual tests override assertBookable as needed.
    vi.mocked(availabilityService.fetchConflictData).mockResolvedValue({
      reservations: [],
      holds: [],
    });
    // assertBookable: slot is bookable by default (returns undefined = no error).
    vi.mocked(assertBookable).mockReturnValue(undefined);
    // Keep these for auto-assign path that doesn't use assertBookable
    vi.mocked(availabilityService.checkTableConflict).mockReturnValue(false);
    vi.mocked(availabilityService.checkPacingForSlot).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("create", () => {
    it("returns error when venue not found", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(null as never);

      const result = await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
        },
        "session-abc"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Venue not found");
    });

    it("auto-assigns table when tableId not provided", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);
      vi.mocked(availabilityService.findBestTable).mockResolvedValueOnce(
        makePrismaTable() as never
      );

      const hold = makePrismaHold();
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: { findFirst: vi.fn().mockResolvedValue(null) },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              create: vi.fn().mockResolvedValue(hold),
            },
          };
          return fn(tx);
        }
      );

      const result = await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
        },
        "session-abc"
      );

      expect(result.success).toBe(true);
      expect(result.hold).toBeDefined();
      expect(availabilityService.findBestTable).toHaveBeenCalled();
    });

    it("returns error when no tables available for auto-assign", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);
      vi.mocked(availabilityService.findBestTable).mockResolvedValueOnce(null as never);

      const result = await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
        },
        "session-abc"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("No available tables");
    });

    it("checks conflict and pacing via assertBookable when tableId is provided", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);
      vi.mocked(assertBookable).mockReturnValueOnce(undefined);

      const hold = makePrismaHold();
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: { findFirst: vi.fn().mockResolvedValue(null) },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              create: vi.fn().mockResolvedValue(hold),
            },
          };
          return fn(tx);
        }
      );

      const result = await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
          tableId: "table-1",
        },
        "session-abc"
      );

      expect(result.success).toBe(true);
      expect(availabilityService.fetchConflictData).toHaveBeenCalledTimes(1);
      expect(assertBookable).toHaveBeenCalledWith(
        expect.objectContaining({
          tableId: "table-1",
          partySize: 2,
          excludeSessionId: "session-abc",
        })
      );
    });

    it("returns error when specified table has conflict (assertBookable returns CONFLICT)", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "CONFLICT",
        message: "Table is not available for this time slot",
      });

      const result = await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
          tableId: "table-1",
        },
        "session-abc"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not available");
    });

    it("returns error when pacing limit exceeded (assertBookable returns PACING_EXCEEDED)", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);
      vi.mocked(assertBookable).mockReturnValueOnce({
        code: "PACING_EXCEEDED",
        message: "Pacing limit reached. Maximum undefined covers per time window.",
      });

      const result = await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
          tableId: "table-1",
        },
        "session-abc"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Pacing limit");
    });

    it("returns error when transaction detects conflicting reservation", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);
      // assertBookable passes pre-check; conflict is caught inside transaction
      vi.mocked(assertBookable).mockReturnValueOnce(undefined);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: {
              findFirst: vi.fn().mockResolvedValue({ id: "conflict-res" }),
            },
            reservationHold: {
              findFirst: vi.fn(),
              deleteMany: vi.fn(),
              create: vi.fn(),
            },
          };
          return fn(tx);
        }
      );

      const result = await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
          tableId: "table-1",
        },
        "session-abc"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not available");
    });

    it("returns error when transaction detects conflicting hold", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);
      // assertBookable passes pre-check; conflict is caught inside transaction
      vi.mocked(assertBookable).mockReturnValueOnce(undefined);

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue({ id: "conflict-hold" }),
              deleteMany: vi.fn(),
              create: vi.fn(),
            },
          };
          return fn(tx);
        }
      );

      const result = await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
          tableId: "table-1",
        },
        "session-abc"
      );

      expect(result.success).toBe(false);
    });

    it("releases existing session holds before creating new one", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);

      const deleteManyMock = vi.fn().mockResolvedValue({ count: 1 });
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: { findFirst: vi.fn().mockResolvedValue(null) },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              deleteMany: deleteManyMock,
              create: vi.fn().mockResolvedValue(makePrismaHold()),
            },
          };
          return fn(tx);
        }
      );

      await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
          tableId: "table-1",
        },
        "session-abc"
      );

      expect(deleteManyMock).toHaveBeenCalledWith({
        where: { sessionId: "session-abc", venueId: "venue-1" },
      });
    });

    it("uses custom holdDurationMinutes from request", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);

      const createMock = vi.fn().mockResolvedValue(makePrismaHold());
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: { findFirst: vi.fn().mockResolvedValue(null) },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              create: createMock,
            },
          };
          return fn(tx);
        }
      );

      await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
          tableId: "table-1",
          holdDurationMinutes: 5,
        },
        "session-abc"
      );

      const createArg = createMock.mock.calls[0][0];
      const expiresAt = createArg.data.expiresAt as Date;
      // 5 minutes from NOW
      expect(expiresAt.getTime() - NOW.getTime()).toBe(5 * 60 * 1000);
    });

    it("uses venue holdDurationMinutes when request does not specify", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: { holdDurationMinutes: 7 },
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);

      const createMock = vi.fn().mockResolvedValue(makePrismaHold());
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: { findFirst: vi.fn().mockResolvedValue(null) },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              create: createMock,
            },
          };
          return fn(tx);
        }
      );

      await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
          tableId: "table-1",
        },
        "session-abc"
      );

      const createArg = createMock.mock.calls[0][0];
      const expiresAt = createArg.data.expiresAt as Date;
      expect(expiresAt.getTime() - NOW.getTime()).toBe(7 * 60 * 1000);
    });

    it("defaults to 10 minute hold duration", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
        id: "venue-1",
        settings: null,
      } as never);
      vi.mocked(availabilityService.estimateDuration).mockReturnValueOnce(90);

      const createMock = vi.fn().mockResolvedValue(makePrismaHold());
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            reservation: { findFirst: vi.fn().mockResolvedValue(null) },
            reservationHold: {
              findFirst: vi.fn().mockResolvedValue(null),
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              create: createMock,
            },
          };
          return fn(tx);
        }
      );

      await holdService.create(
        {
          venueId: "venue-1",
          date: "2026-05-05",
          time: "2026-05-05T22:00:00Z",
          partySize: 2,
          tableId: "table-1",
        },
        "session-abc"
      );

      const createArg = createMock.mock.calls[0][0];
      const expiresAt = createArg.data.expiresAt as Date;
      expect(expiresAt.getTime() - NOW.getTime()).toBe(10 * 60 * 1000);
    });
  });

  describe("getById", () => {
    it("returns hold when found and not expired", async () => {
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(makePrismaHold() as never);

      const result = await holdService.getById("hold-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("hold-1");
      expect(typeof result!.startTime).toBe("string");
      expect(typeof result!.expiresAt).toBe("string");
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(null as never);

      expect(await holdService.getById("missing")).toBeNull();
    });

    it("returns null and deletes when expired", async () => {
      vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(
        makePrismaHold({ expiresAt: FIVE_MIN_AGO }) as never
      );
      vi.mocked(prisma.reservationHold.delete).mockResolvedValueOnce(undefined as never);

      const result = await holdService.getById("hold-1");

      expect(result).toBeNull();
      expect(prisma.reservationHold.delete).toHaveBeenCalledWith({
        where: { id: "hold-1" },
      });
    });
  });

  describe("getBySessionId", () => {
    it("returns active hold for session and venue", async () => {
      vi.mocked(prisma.reservationHold.findFirst).mockResolvedValueOnce(makePrismaHold() as never);

      const result = await holdService.getBySessionId("session-abc", "venue-1");

      expect(result!.sessionId).toBe("session-abc");
      expect(prisma.reservationHold.findFirst).toHaveBeenCalledWith({
        where: {
          sessionId: "session-abc",
          venueId: "venue-1",
          expiresAt: { gt: expect.any(Date) },
        },
      });
    });

    it("returns null when no active hold exists", async () => {
      vi.mocked(prisma.reservationHold.findFirst).mockResolvedValueOnce(null as never);

      expect(await holdService.getBySessionId("session-xyz", "venue-1")).toBeNull();
    });
  });

  describe("release", () => {
    it("returns true when hold is deleted", async () => {
      vi.mocked(prisma.reservationHold.deleteMany).mockResolvedValueOnce({
        count: 1,
      } as never);

      const result = await holdService.release("hold-1", "session-abc");

      expect(result).toBe(true);
      expect(prisma.reservationHold.deleteMany).toHaveBeenCalledWith({
        where: { id: "hold-1", sessionId: "session-abc" },
      });
    });

    it("returns false when no hold was deleted", async () => {
      vi.mocked(prisma.reservationHold.deleteMany).mockResolvedValueOnce({
        count: 0,
      } as never);

      expect(await holdService.release("hold-1", "wrong-session")).toBe(false);
    });

    it("returns false on error", async () => {
      vi.mocked(prisma.reservationHold.deleteMany).mockRejectedValueOnce(
        new Error("DB error") as never
      );

      expect(await holdService.release("hold-1", "session-abc")).toBe(false);
    });
  });

  describe("cleanupExpired", () => {
    it("deletes all expired holds and returns count", async () => {
      vi.mocked(prisma.reservationHold.deleteMany).mockResolvedValueOnce({
        count: 5,
      } as never);

      const count = await holdService.cleanupExpired();

      expect(count).toBe(5);
      expect(prisma.reservationHold.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });

  describe("maybeCleanup", () => {
    it("performs cleanup approximately 1% of the time", async () => {
      vi.mocked(prisma.reservationHold.deleteMany).mockResolvedValue({
        count: 0,
      } as never);

      let cleanupCount = 0;
      const iterations = 10000;

      // Seed Math.random to make test deterministic
      const mockRandom = vi.spyOn(Math, "random");

      for (let i = 0; i < iterations; i++) {
        // Simulate: random < 0.01 triggers cleanup
        mockRandom.mockReturnValueOnce(i < 100 ? 0.005 : 0.5);
        const didClean = await holdService.maybeCleanup();
        if (didClean) cleanupCount++;
      }

      // First 100 calls return 0.005 (< 0.01), so cleanup runs
      expect(cleanupCount).toBe(100);

      mockRandom.mockRestore();
    });

    it("returns false when cleanup is skipped", async () => {
      vi.spyOn(Math, "random").mockReturnValueOnce(0.5);

      const result = await holdService.maybeCleanup();

      expect(result).toBe(false);
      expect(prisma.reservationHold.deleteMany).not.toHaveBeenCalled();

      vi.spyOn(Math, "random").mockRestore();
    });

    it("returns true when cleanup is performed", async () => {
      vi.spyOn(Math, "random").mockReturnValueOnce(0.005);
      vi.mocked(prisma.reservationHold.deleteMany).mockResolvedValueOnce({
        count: 3,
      } as never);

      const result = await holdService.maybeCleanup();

      expect(result).toBe(true);

      vi.spyOn(Math, "random").mockRestore();
    });
  });
});
