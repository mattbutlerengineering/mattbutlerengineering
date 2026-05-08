/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
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
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("./events.js", () => ({
  emitFloorPlanCreated: vi.fn(),
}));

import { floorPlanService } from "./floor-plan.js";
import { prisma } from "./database.js";
import { emitFloorPlanCreated } from "./events.js";

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
      expect(result.data[0].id).toBe("fp-1");
      expect(result.data[0].tables).toHaveLength(1);
      expect(result.data[0].layoutJson).toEqual({ width: 800, height: 600 });
      expect(typeof result.data[0].createdAt).toBe("string");
    });

    it("filters by venueId when provided", async () => {
      vi.mocked(prisma.floorPlan.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.floorPlan.count).mockResolvedValueOnce(0 as never);

      await floorPlanService.list(1, 10, "venue-1");

      expect(prisma.floorPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { venueId: "venue-1" } })
      );
    });
  });

  describe("getById", () => {
    it("returns floor plan with tables", async () => {
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce(makePrismaFloorPlan() as never);

      const result = await floorPlanService.getById("fp-1");

      expect(result!.name).toBe("Main Floor");
      expect(result!.tables).toHaveLength(1);
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce(null as never);

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
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce(null as never);

      expect(await floorPlanService.clone("missing")).toBeNull();
    });

    it("clones floor plan with tables in a transaction", async () => {
      const source = makePrismaFloorPlan();
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce(source as never);

      vi.mocked(prisma.floorPlan.findMany).mockResolvedValueOnce([] as never);

      const cloned = makePrismaFloorPlan({ id: "fp-2", name: "Copy of Main Floor", isActive: false });
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          floorPlan: {
            create: vi.fn().mockResolvedValue({ id: "fp-2" }),
            findUnique: vi.fn().mockResolvedValue(cloned),
          },
          table: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

      const result = await floorPlanService.clone("fp-1");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Copy of Main Floor");
      expect(emitFloorPlanCreated).toHaveBeenCalledWith(result);
    });

    it("handles name collisions by appending copy number", async () => {
      const source = makePrismaFloorPlan();
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValueOnce(source as never);

      vi.mocked(prisma.floorPlan.findMany).mockResolvedValueOnce([
        { name: "Copy of Main Floor" },
      ] as never);

      const cloned = makePrismaFloorPlan({
        id: "fp-3",
        name: "Main Floor (Copy 2)",
        isActive: false,
      });
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          floorPlan: {
            create: vi.fn().mockResolvedValue({ id: "fp-3" }),
            findUnique: vi.fn().mockResolvedValue(cloned),
          },
          table: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

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
    it("deletes tables then floor plan", async () => {
      vi.mocked(prisma.table.deleteMany).mockResolvedValueOnce({ count: 2 } as never);
      vi.mocked(prisma.floorPlan.delete).mockResolvedValueOnce(undefined as never);

      const result = await floorPlanService.delete("fp-1");

      expect(result).toBe(true);
      expect(prisma.table.deleteMany).toHaveBeenCalledWith({
        where: { floorPlanId: "fp-1" },
      });
    });

    it("returns false for P2025", async () => {
      vi.mocked(prisma.table.deleteMany).mockResolvedValueOnce({ count: 0 } as never);
      vi.mocked(prisma.floorPlan.delete).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await floorPlanService.delete("missing")).toBe(false);
    });
  });

  describe("setActive", () => {
    it("deactivates all then activates the target", async () => {
      const activated = makePrismaFloorPlan({ isActive: true });
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          floorPlan: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: vi.fn().mockResolvedValue(activated),
          },
        };
        return fn(tx);
      });

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
    it("updates multiple tables in a transaction", async () => {
      const tables = [
        makePrismaTable({ id: "t1" }),
        makePrismaTable({ id: "t2" }),
      ];
      vi.mocked(prisma.$transaction).mockResolvedValueOnce(tables as never);

      const positions = [
        { tableId: "t1", shapeMetadata: { x: 10, y: 20, width: 80, height: 80, shape: "rectangle" as const } },
        { tableId: "t2", shapeMetadata: { x: 30, y: 40, width: 80, height: 80, shape: "circle" as const } },
      ];

      const result = await floorPlanService.bulkUpdateTablePositions("fp-1", positions);

      expect(result).toHaveLength(2);
    });
  });

  describe("assignTableToFloorPlan", () => {
    it("assigns table to floor plan with shape metadata", async () => {
      const meta = { x: 100, y: 100, width: 60, height: 60, shape: "square" as const };
      vi.mocked(prisma.table.update).mockResolvedValueOnce(
        makePrismaTable({ floorPlanId: "fp-2", shapeMetadata: meta }) as never
      );

      const result = await floorPlanService.assignTableToFloorPlan("table-1", "fp-2", meta);

      expect(result!.floorPlanId).toBe("fp-2");
    });

    it("assigns without shape metadata", async () => {
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
      vi.mocked(prisma.table.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await floorPlanService.assignTableToFloorPlan("missing", "fp-1")).toBeNull();
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
