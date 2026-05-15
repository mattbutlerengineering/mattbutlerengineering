import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    table: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { tableService } from "./table.js";
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
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("tableService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns paginated tables", async () => {
      const dbTable = makePrismaTable();
      vi.mocked(prisma.table.findMany).mockResolvedValueOnce([dbTable] as never);
      vi.mocked(prisma.table.count).mockResolvedValueOnce(1 as never);

      const result = await tableService.list(1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("table-1");
      expect(result.data[0].createdAt).toBe(NOW.toISOString());
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it("calculates pagination correctly for multiple pages", async () => {
      vi.mocked(prisma.table.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.table.count).mockResolvedValueOnce(25 as never);

      const result = await tableService.list(2, 10);

      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it("filters by activeOnly when true", async () => {
      vi.mocked(prisma.table.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.table.count).mockResolvedValueOnce(0 as never);

      await tableService.list(1, 10, true);

      expect(prisma.table.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } })
      );
    });

    it("does not filter by active when activeOnly is false", async () => {
      vi.mocked(prisma.table.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.table.count).mockResolvedValueOnce(0 as never);

      await tableService.list(1, 10, false);

      expect(prisma.table.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });

  describe("getById", () => {
    it("returns mapped table when found", async () => {
      const dbTable = makePrismaTable();
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce(dbTable as never);

      const result = await tableService.getById("table-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("table-1");
      expect(result!.status).toBe("AVAILABLE");
      expect(typeof result!.createdAt).toBe("string");
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.table.findUnique).mockResolvedValueOnce(null as never);

      const result = await tableService.getById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("creates a table with all fields", async () => {
      const dbTable = makePrismaTable();
      vi.mocked(prisma.table.create).mockResolvedValueOnce(dbTable as never);

      const result = await tableService.create({
        name: "Table 1",
        capacity: 4,
        minCovers: 1,
        maxCovers: 6,
        location: "Main Floor",
        venueId: "venue-1",
      });

      expect(result.name).toBe("Table 1");
      expect(prisma.table.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Table 1",
          capacity: 4,
          minCovers: 1,
          maxCovers: 6,
          location: "Main Floor",
          venueId: "venue-1",
        }),
      });
    });

    it("uses defaults for optional fields", async () => {
      const dbTable = makePrismaTable({ minCovers: 1, maxCovers: null, location: null });
      vi.mocked(prisma.table.create).mockResolvedValueOnce(dbTable as never);

      await tableService.create({ name: "Bar Seat", capacity: 2 });

      expect(prisma.table.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          minCovers: 1,
          maxCovers: null,
          location: null,
          priority: 0,
        }),
      });
    });
  });

  describe("update", () => {
    it("updates specified fields only", async () => {
      const dbTable = makePrismaTable({ name: "New Name" });
      vi.mocked(prisma.table.update).mockResolvedValueOnce(dbTable as never);

      const result = await tableService.update("table-1", { name: "New Name" });

      expect(result!.name).toBe("New Name");
    });

    it("returns null for P2025 (not found)", async () => {
      vi.mocked(prisma.table.update).mockRejectedValueOnce({ code: "P2025" } as never);

      const result = await tableService.update("missing", { name: "X" });

      expect(result).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      vi.mocked(prisma.table.update).mockRejectedValueOnce(
        new Error("DB connection lost") as never
      );

      await expect(tableService.update("table-1", { name: "X" })).rejects.toThrow(
        "DB connection lost"
      );
    });
  });

  describe("updateStatus", () => {
    it("transitions AVAILABLE to OCCUPIED", async () => {
      const dbTable = makePrismaTable({ status: "OCCUPIED" });
      vi.mocked(prisma.table.update).mockResolvedValueOnce(dbTable as never);

      const result = await tableService.updateStatus("table-1", "OCCUPIED");

      expect(result!.status).toBe("OCCUPIED");
      expect(prisma.table.update).toHaveBeenCalledWith({
        where: { id: "table-1" },
        data: { status: "OCCUPIED" },
      });
    });

    it("transitions OCCUPIED to DIRTY", async () => {
      const dbTable = makePrismaTable({ status: "DIRTY" });
      vi.mocked(prisma.table.update).mockResolvedValueOnce(dbTable as never);

      const result = await tableService.updateStatus("table-1", "DIRTY");

      expect(result!.status).toBe("DIRTY");
    });

    it("transitions DIRTY to READY", async () => {
      const dbTable = makePrismaTable({ status: "READY" });
      vi.mocked(prisma.table.update).mockResolvedValueOnce(dbTable as never);

      const result = await tableService.updateStatus("table-1", "READY");

      expect(result!.status).toBe("READY");
    });

    it("transitions READY to AVAILABLE", async () => {
      const dbTable = makePrismaTable({ status: "AVAILABLE" });
      vi.mocked(prisma.table.update).mockResolvedValueOnce(dbTable as never);

      const result = await tableService.updateStatus("table-1", "AVAILABLE");

      expect(result!.status).toBe("AVAILABLE");
    });

    it("returns null for invalid status string", async () => {
      const result = await tableService.updateStatus("table-1", "BROKEN");

      expect(result).toBeNull();
      expect(prisma.table.update).not.toHaveBeenCalled();
    });

    it("returns null for P2025 (table not found)", async () => {
      vi.mocked(prisma.table.update).mockRejectedValueOnce({ code: "P2025" } as never);

      const result = await tableService.updateStatus("missing", "AVAILABLE");

      expect(result).toBeNull();
    });

    it("accepts all four valid statuses", async () => {
      const statuses = ["AVAILABLE", "OCCUPIED", "DIRTY", "READY"] as const;

      for (const s of statuses) {
        vi.mocked(prisma.table.update).mockResolvedValueOnce(
          makePrismaTable({ status: s }) as never
        );
        const result = await tableService.updateStatus("table-1", s);
        expect(result).not.toBeNull();
      }
    });
  });

  describe("delete", () => {
    it("returns true on success", async () => {
      vi.mocked(prisma.table.delete).mockResolvedValueOnce(undefined as never);

      const result = await tableService.delete("table-1");

      expect(result).toBe(true);
    });

    it("returns false for P2025 (not found)", async () => {
      vi.mocked(prisma.table.delete).mockRejectedValueOnce({ code: "P2025" } as never);

      const result = await tableService.delete("missing");

      expect(result).toBe(false);
    });

    it("re-throws non-P2025 errors", async () => {
      vi.mocked(prisma.table.delete).mockRejectedValueOnce(new Error("FK constraint") as never);

      await expect(tableService.delete("table-1")).rejects.toThrow("FK constraint");
    });
  });
});
