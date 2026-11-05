/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      floorPlan: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      table: {
        createMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  });
});

import { floorPlanService } from "./floor-plan.js";
import { prisma } from "./database.js";

const NOW = new Date("2026-05-01T12:00:00Z");

function makePrismaTable(overrides: Record<string, unknown> = {}) {
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
    floorPlanId: "fp-1",
    shapeMetadata: { x: 100, y: 200, width: 80, height: 80, shape: "rectangle" },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makePrismaFloorPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "fp-1",
    venueId: "venue-1",
    name: "Main Floor",
    isActive: true,
    layoutJson: { width: 800, height: 600 },
    tables: [makePrismaTable()],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("floorPlanService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns paginated floor plans with tables", async () => {
      vi.mocked(prisma.floorPlan.findMany).mockResolvedValueOnce([makePrismaFloorPlan()] as never);
      vi.mocked(prisma.floorPlan.count).mockResolvedValueOnce(1 as never);

      const result = await floorPlanService.list(1, 10);

      expect(result.data).toHaveLength(1);
      const [floorPlan] = result.data;
      if (!floorPlan) throw new Error("expected a floor plan");
      expect(floorPlan.id).toBe("fp-1");
      expect(floorPlan.tables).toHaveLength(1);
      expect(floorPlan.layoutJson).toEqual({ width: 800, height: 600 });
      expect(typeof floorPlan.createdAt).toBe("string");
    });

    it("filters by venueId when provided", async () => {
      vi.mocked(prisma.floorPlan.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.floorPlan.count).mockResolvedValueOnce(0 as never);

      await floorPlanService.list(1, 10, "venue-1");

      expect(prisma.floorPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { archivedAt: null, venueId: "venue-1" } })
      );
    });
  });

  describe("getById", () => {
    it("returns floor plan with tables", async () => {
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce(makePrismaFloorPlan() as never);

      const result = await floorPlanService.getById("fp-1");

      expect(result!.name).toBe("Main Floor");
      expect(result!.tables).toHaveLength(1);
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce(null as never);

      expect(await floorPlanService.getById("missing")).toBeNull();
    });
  });

  describe("getActiveByVenueId", () => {
    it("returns active floor plan for venue", async () => {
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce(makePrismaFloorPlan() as never);

      const result = await floorPlanService.getActiveByVenueId("venue-1");

      expect(result!.isActive).toBe(true);
      expect(prisma.floorPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { venueId: "venue-1", isActive: true },
        })
      );
    });

    it("returns null when no active floor plan", async () => {
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce(null as never);

      expect(await floorPlanService.getActiveByVenueId("venue-1")).toBeNull();
    });
  });

  describe("create", () => {
    it("creates floor plan", async () => {
      vi.mocked(prisma.floorPlan.create).mockResolvedValueOnce(
        makePrismaFloorPlan({ tables: [] }) as never
      );

      const result = await floorPlanService.create({
        venueId: "venue-1",
        name: "Main Floor",
        layoutJson: { width: 800, height: 600 },
      });

      expect(result.name).toBe("Main Floor");
      expect(prisma.floorPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            venueId: "venue-1",
            name: "Main Floor",
            isActive: false,
          }),
        })
      );
    });

    it("defaults isActive to false", async () => {
      vi.mocked(prisma.floorPlan.create).mockResolvedValueOnce(
        makePrismaFloorPlan({ isActive: false }) as never
      );

      await floorPlanService.create({
        venueId: "venue-1",
        name: "Floor",
        layoutJson: { width: 100, height: 100 },
      });

      expect(prisma.floorPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        })
      );
    });
  });

  describe("clone", () => {
    it("returns null when source floor plan not found", async () => {
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce(null as never);

      expect(await floorPlanService.clone("missing")).toBeNull();
    });

    it("clones floor plan with tables in a transaction", async () => {
      const createMany = vi.fn().mockResolvedValue({ count: 1 });
      const source = makePrismaFloorPlan();
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce(source as never);

      vi.mocked(prisma.floorPlan.findMany).mockResolvedValueOnce([] as never);

      const cloned = makePrismaFloorPlan({
        id: "fp-2",
        name: "Copy of Main Floor",
        isActive: false,
      });
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRawUnsafe: vi.fn().mockResolvedValue(0),
            $executeRaw: vi.fn().mockResolvedValue(0),
            floorPlan: {
              create: vi.fn().mockResolvedValue({ id: "fp-2" }),
              findUnique: vi.fn().mockResolvedValue(cloned),
            },
            table: {
              findMany: vi.fn().mockResolvedValue([{ name: "Table 1" }]),
              createMany,
            },
          };
          return fn(tx);
        }
      );

      const result = await floorPlanService.clone("fp-1");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Copy of Main Floor");
      // Table names are unique per venue (#8255): the copy cannot reuse "Table 1".
      expect(createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ name: "Table 1-2", floorPlanId: "fp-2" })],
      });
    });

    it("creates cloned tables inactive so a clone adds no bookable capacity", async () => {
      // Every active table in a venue is bookable whatever its plan, and
      // activating a plan does not touch tables — an active copy would double
      // online capacity while the cloned plan is still inactive.
      const createMany = vi.fn().mockResolvedValue({ count: 1 });
      const source = makePrismaFloorPlan();
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce(source as never);
      vi.mocked(prisma.floorPlan.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) =>
          fn({
            $executeRawUnsafe: vi.fn().mockResolvedValue(0),
            $executeRaw: vi.fn().mockResolvedValue(0),
            floorPlan: {
              create: vi.fn().mockResolvedValue({ id: "fp-2" }),
              findUnique: vi.fn().mockResolvedValue(makePrismaFloorPlan({ id: "fp-2" })),
            },
            table: { findMany: vi.fn().mockResolvedValue([]), createMany },
          })
      );

      await floorPlanService.clone("fp-1");

      const rows = createMany.mock.calls[0]![0].data as Array<{ isActive: boolean }>;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.isActive === false)).toBe(true);
    });

    it("handles name collisions by appending copy number", async () => {
      const createMany = vi.fn().mockResolvedValue({ count: 1 });
      const source = makePrismaFloorPlan();
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce(source as never);

      vi.mocked(prisma.floorPlan.findMany).mockResolvedValueOnce([
        { name: "Copy of Main Floor" },
      ] as never);

      const cloned = makePrismaFloorPlan({
        id: "fp-3",
        name: "Main Floor (Copy 2)",
        isActive: false,
      });
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRawUnsafe: vi.fn().mockResolvedValue(0),
            $executeRaw: vi.fn().mockResolvedValue(0),
            floorPlan: {
              create: vi.fn().mockResolvedValue({ id: "fp-3" }),
              findUnique: vi.fn().mockResolvedValue(cloned),
            },
            table: {
              findMany: vi.fn().mockResolvedValue([{ name: "Table 1" }]),
              createMany,
            },
          };
          return fn(tx);
        }
      );

      const result = await floorPlanService.clone("fp-1");

      expect(result!.name).toBe("Main Floor (Copy 2)");
    });
  });

  describe("update", () => {
    it("updates name", async () => {
      vi.mocked(prisma.floorPlan.update).mockResolvedValueOnce(
        makePrismaFloorPlan({ name: "Updated" }) as never
      );

      const result = await floorPlanService.update("fp-1", { name: "Updated" });

      expect(result!.name).toBe("Updated");
    });

    it("returns null for P2025", async () => {
      vi.mocked(prisma.floorPlan.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await floorPlanService.update("missing", { name: "X" })).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      vi.mocked(prisma.floorPlan.update).mockRejectedValueOnce(new Error("DB error") as never);

      await expect(floorPlanService.update("fp-1", { name: "X" })).rejects.toThrow("DB error");
    });
  });

  describe("delete", () => {
    /** A transaction client for `delete`: the locked plan row, its tables, its history. */
    function deleteTx(opts: {
      plan?: { isActive: boolean; archivedAt: Date | null };
      tables?: Array<{ id: string; name: string }>;
      venueNames?: string[];
      history?: number;
      upcoming?: number;
    }) {
      const tables = opts.tables ?? [{ id: "t-1", name: "T1" }];
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(0),
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
        $queryRaw: vi.fn().mockResolvedValue(opts.plan ? [opts.plan] : []),
        floorPlan: { delete: vi.fn(), update: vi.fn() },
        table: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce(tables)
            .mockResolvedValueOnce((opts.venueNames ?? []).map((name) => ({ name }))),
          deleteMany: vi.fn(),
          update: vi.fn(),
        },
        reservation: {
          count: vi
            .fn()
            .mockResolvedValueOnce(opts.upcoming ?? 0)
            .mockResolvedValueOnce(opts.history ?? 0),
        },
        reservationHold: { count: vi.fn().mockResolvedValue(0) },
      };
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce({ venueId: "venue-1" } as never);
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => fn(tx)
      );
      return tx;
    }

    const inactive = { isActive: false, archivedAt: null };

    it("is not_found when the plan does not exist or is archived", async () => {
      vi.mocked(prisma.floorPlan.findFirst).mockResolvedValueOnce(null as never);

      expect(await floorPlanService.delete("missing")).toBe("not_found");
      expect(prisma.floorPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "missing", archivedAt: null } })
      );
    });

    it("refuses the active plan without touching anything", async () => {
      const tx = deleteTx({ plan: { isActive: true, archivedAt: null } });

      expect(await floorPlanService.delete("fp-1")).toBe("active");
      expect(tx.table.deleteMany).not.toHaveBeenCalled();
      expect(tx.floorPlan.update).not.toHaveBeenCalled();
    });

    it("refuses a plan whose tables still have an upcoming booking", async () => {
      const tx = deleteTx({ plan: inactive, upcoming: 1, history: 1 });

      expect(await floorPlanService.delete("fp-1")).toBe("has_upcoming");
      expect(tx.reservation.count).toHaveBeenCalledWith({
        where: {
          tableId: { in: ["t-1"] },
          status: { notIn: ["CANCELLED", "NO_SHOW", "COMPLETED"] },
          endTime: { gt: expect.any(Date) },
        },
      });
      expect(tx.table.update).not.toHaveBeenCalled();
      expect(tx.floorPlan.update).not.toHaveBeenCalled();
    });

    it("hard-deletes tables then the plan when nothing was ever booked", async () => {
      const tx = deleteTx({ plan: inactive });

      expect(await floorPlanService.delete("fp-1")).toBe("deleted");
      expect(tx.table.deleteMany).toHaveBeenCalledWith({ where: { floorPlanId: "fp-1" } });
      expect(tx.floorPlan.delete).toHaveBeenCalledWith({ where: { id: "fp-1" } });
    });

    it("archives a plan with history, freeing its table names", async () => {
      const tx = deleteTx({
        plan: inactive,
        tables: [{ id: "t-1", name: "T1" }],
        venueNames: ["T1", "T1 (archived)"],
        history: 1,
      });

      expect(await floorPlanService.delete("fp-1")).toBe("archived");
      expect(tx.table.deleteMany).not.toHaveBeenCalled();
      expect(tx.table.update).toHaveBeenCalledWith({
        where: { id: "t-1" },
        data: { name: "T1 (archived 2)", isActive: false },
      });
      expect(tx.floorPlan.update).toHaveBeenCalledWith({
        where: { id: "fp-1" },
        data: { archivedAt: expect.any(Date) },
      });
    });

    it("is in_use, not a raw error, when a booking lands mid-delete", async () => {
      const tx = deleteTx({ plan: inactive });
      tx.table.deleteMany.mockRejectedValueOnce({ code: "P2003" });

      expect(await floorPlanService.delete("fp-1")).toBe("in_use");
    });
  });

  describe("setActive", () => {
    it("deactivates all then activates the target", async () => {
      const activated = makePrismaFloorPlan({ isActive: true });
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          const tx = {
            $executeRawUnsafe: vi.fn().mockResolvedValue(0),
            $executeRaw: vi.fn().mockResolvedValue(0),
            floorPlan: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              update: vi.fn().mockResolvedValue(activated),
            },
          };
          return fn(tx);
        }
      );

      const result = await floorPlanService.setActive("fp-1", "venue-1");

      expect(result!.isActive).toBe(true);
    });

    it("returns null for P2025", async () => {
      vi.mocked(prisma.$transaction).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await floorPlanService.setActive("missing", "venue-1")).toBeNull();
    });
  });

  describe("updateTablePosition", () => {
    it("updates shape metadata on table", async () => {
      const meta = { x: 200, y: 300, width: 80, height: 80, shape: "circle" as const };
      vi.mocked(prisma.table.update).mockResolvedValueOnce(
        makePrismaTable({ shapeMetadata: meta }) as never
      );

      const result = await floorPlanService.updateTablePosition("table-1", meta);

      expect(result!.shapeMetadata).toEqual(meta);
    });

    it("returns null for P2025", async () => {
      vi.mocked(prisma.table.update).mockRejectedValueOnce({ code: "P2025" } as never);

      const meta = { x: 0, y: 0, width: 50, height: 50, shape: "square" as const };
      expect(await floorPlanService.updateTablePosition("missing", meta)).toBeNull();
    });
  });

  describe("bulkUpdateTablePositions", () => {
    /**
     * The raw UPDATE now runs inside `prisma.$transaction` so
     * `setVenueContext` (ADR-026 part 6) can set app.venue_id on the same
     * `tx` first — wires `prisma.$transaction` to invoke its callback with a
     * `tx` exposing the given `queryRaw` mock, mirroring a real interactive
     * transaction.
     */
    function mockTransaction(queryRaw: ReturnType<typeof vi.fn>): void {
      vi.mocked(prisma.$transaction).mockImplementationOnce((async (
        fn: (tx: {
          $executeRaw: ReturnType<typeof vi.fn>;
          $executeRawUnsafe: ReturnType<typeof vi.fn>;
          $queryRaw: typeof queryRaw;
        }) => unknown
      ) =>
        fn({
          $executeRaw: vi.fn().mockResolvedValue(0),
          $executeRawUnsafe: vi.fn().mockResolvedValue(0),
          $queryRaw: queryRaw,
        })) as never);
    }

    it("issues exactly one database call for multiple positions", async () => {
      const tables = [makePrismaTable({ id: "t1" }), makePrismaTable({ id: "t2" })];
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce({
        venueId: "venue-1",
      } as never);
      const queryRaw = vi.fn().mockResolvedValueOnce(tables as never);
      mockTransaction(queryRaw);

      const positions = [
        {
          tableId: "t1",
          shapeMetadata: { x: 10, y: 20, width: 80, height: 80, shape: "rectangle" as const },
        },
        {
          tableId: "t2",
          shapeMetadata: { x: 30, y: 40, width: 80, height: 80, shape: "circle" as const },
        },
      ];

      const result = await floorPlanService.bulkUpdateTablePositions("fp-1", positions);

      expect(result).toHaveLength(2);
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("returns an empty array without issuing a query when positions is empty", async () => {
      const result = await floorPlanService.bulkUpdateTablePositions("fp-1", []);

      expect(result).toEqual([]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("throws a P2025 not-found error when a tableId does not match any row", async () => {
      // Only one of the two requested tableIds actually exists — simulates a
      // deleted/unknown tableId in the batch.
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce({
        venueId: "venue-1",
      } as never);
      mockTransaction(vi.fn().mockResolvedValueOnce([makePrismaTable({ id: "t1" })] as never));

      const positions = [
        {
          tableId: "t1",
          shapeMetadata: { x: 10, y: 20, width: 80, height: 80, shape: "rectangle" as const },
        },
        {
          tableId: "missing",
          shapeMetadata: { x: 30, y: 40, width: 80, height: 80, shape: "circle" as const },
        },
      ];

      await expect(
        floorPlanService.bulkUpdateTablePositions("fp-1", positions)
      ).rejects.toMatchObject({ code: "P2025" });
    });

    it("scopes the UPDATE to the floor plan's own venue", async () => {
      // The route authorizes on the floor plan's venue but the tableIds are
      // caller-supplied, so the statement itself must carry the tenant
      // predicate — otherwise a member of one venue can re-point another
      // venue's tables into their own floor plan.
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce({
        venueId: "venue-1",
      } as never);
      const queryRaw = vi.fn().mockResolvedValueOnce([makePrismaTable({ id: "t1" })] as never);
      mockTransaction(queryRaw);

      await floorPlanService.bulkUpdateTablePositions("fp-1", [
        {
          tableId: "t1",
          shapeMetadata: { x: 10, y: 20, width: 80, height: 80, shape: "rectangle" as const },
        },
      ]);

      const call = queryRaw.mock.calls[0] as unknown as [string[], ...unknown[]];
      const [fragments, ...values] = call;
      expect(fragments.join("?")).toContain("t.venue_id =");
      expect(values).toContain("venue-1");
    });

    it("throws a P2025 not-found error when the floor plan does not exist", async () => {
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce(null as never);

      await expect(
        floorPlanService.bulkUpdateTablePositions("missing-fp", [
          {
            tableId: "t1",
            shapeMetadata: { x: 10, y: 20, width: 80, height: 80, shape: "rectangle" as const },
          },
        ])
      ).rejects.toMatchObject({ code: "P2025" });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("assignTableToFloorPlan", () => {
    /** Both entities resolve to the same venue — the ordinary, permitted case. */
    function mockSameVenue(venueId = "venue-1") {
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({ venueId } as never);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce({ venueId } as never);
    }

    it("assigns table to floor plan with shape metadata", async () => {
      const meta = { x: 100, y: 100, width: 60, height: 60, shape: "square" as const };
      mockSameVenue();
      vi.mocked(prisma.table.update).mockResolvedValueOnce(
        makePrismaTable({ floorPlanId: "fp-2", shapeMetadata: meta }) as never
      );

      const result = await floorPlanService.assignTableToFloorPlan("table-1", "fp-2", meta);

      expect(result!.floorPlanId).toBe("fp-2");
    });

    it("assigns without shape metadata", async () => {
      mockSameVenue();
      vi.mocked(prisma.table.update).mockResolvedValueOnce(
        makePrismaTable({ floorPlanId: "fp-2" }) as never
      );

      await floorPlanService.assignTableToFloorPlan("table-1", "fp-2");

      expect(prisma.table.update).toHaveBeenCalledWith({
        where: { id: "table-1" },
        data: expect.objectContaining({
          floorPlanId: "fp-2",
          shapeMetadata: undefined,
        }),
      });
    });

    it("returns null for P2025", async () => {
      mockSameVenue();
      vi.mocked(prisma.table.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await floorPlanService.assignTableToFloorPlan("missing", "fp-1")).toBeNull();
    });

    it("refuses to assign a table owned by a different venue", async () => {
      // The route authorizes on the body's floorPlanId, so :tableId is
      // caller-controlled and unchecked — without this guard a member of
      // venue-1 can pull venue-2's table onto their own floor plan.
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({ venueId: "venue-2" } as never);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce({ venueId: "venue-1" } as never);

      const result = await floorPlanService.assignTableToFloorPlan("foreign-table", "fp-1");

      expect(result).toBeNull();
      expect(prisma.table.update).not.toHaveBeenCalled();
    });

    it("refuses to assign a table that belongs to no venue", async () => {
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({ venueId: null } as never);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce({ venueId: "venue-1" } as never);

      expect(await floorPlanService.assignTableToFloorPlan("orphan-table", "fp-1")).toBeNull();
      expect(prisma.table.update).not.toHaveBeenCalled();
    });

    it("returns null when the target floor plan does not exist", async () => {
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({ venueId: "venue-1" } as never);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce(null as never);

      expect(await floorPlanService.assignTableToFloorPlan("table-1", "missing-fp")).toBeNull();
      expect(prisma.table.update).not.toHaveBeenCalled();
    });

    it("returns null when the table does not exist", async () => {
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce(null as never);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce({ venueId: "venue-1" } as never);

      expect(await floorPlanService.assignTableToFloorPlan("missing-table", "fp-1")).toBeNull();
      expect(prisma.table.update).not.toHaveBeenCalled();
    });
  });

  describe("removeTableFromFloorPlan", () => {
    it("sets floorPlanId to null and clears shapeMetadata", async () => {
      vi.mocked(prisma.table.update).mockResolvedValueOnce(
        makePrismaTable({ floorPlanId: null, shapeMetadata: null }) as never
      );

      const result = await floorPlanService.removeTableFromFloorPlan("table-1");

      expect(result!.floorPlanId).toBeNull();
    });

    it("returns null for P2025", async () => {
      vi.mocked(prisma.table.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await floorPlanService.removeTableFromFloorPlan("missing")).toBeNull();
    });
  });
});
