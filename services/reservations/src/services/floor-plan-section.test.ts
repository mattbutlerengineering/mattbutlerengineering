import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  const delegate = () => ({
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  });
  return createMockDatabaseService({
    prisma: {
      floorPlan: delegate(),
      floorPlanSection: delegate(),
      table: delegate(),
      $transaction: vi.fn(),
    },
  });
});

vi.mock("../middleware/venue-context.js", () => ({ setVenueContext: vi.fn() }));

import { floorPlanSectionService } from "./floor-plan-section.js";
import { prisma } from "./database.js";

type Delegate = Record<
  "findMany" | "findFirst" | "create" | "updateMany" | "deleteMany" | "count",
  Mock
>;
const db = prisma as unknown as {
  floorPlan: Delegate;
  floorPlanSection: Delegate;
  table: Delegate;
  $transaction: Mock;
};

const now = new Date("2026-10-22T00:00:00.000Z");
const row = {
  id: "s1",
  venueId: "v1",
  floorPlanId: "f1",
  name: "Patio",
  color: "#3366cc",
  displayOrder: 0,
  createdAt: now,
  updatedAt: now,
};

function whereOf(mock: Mock, call = 0): unknown {
  return (mock.mock.calls[call]?.[0] as { where: unknown }).where;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("floorPlanSectionService", () => {
  it("lists a venue's sections in display order, optionally for one floor plan", async () => {
    db.floorPlanSection.findMany.mockResolvedValue([row]);
    const result = await floorPlanSectionService.list("v1", "f1");
    expect(whereOf(db.floorPlanSection.findMany)).toEqual({ venueId: "v1", floorPlanId: "f1" });
    expect(result[0]).toMatchObject({ id: "s1", createdAt: now.toISOString() });

    await floorPlanSectionService.list("v1");
    expect(whereOf(db.floorPlanSection.findMany, 1)).toEqual({ venueId: "v1" });
  });

  it("creates only under a floor plan of the same venue", async () => {
    db.floorPlan.findFirst.mockResolvedValue(null);
    expect(
      await floorPlanSectionService.create("v1", { floorPlanId: "other", name: "Patio" })
    ).toBeNull();
    expect(whereOf(db.floorPlan.findFirst)).toEqual({ id: "other", venueId: "v1" });
    expect(db.floorPlanSection.create).not.toHaveBeenCalled();

    db.floorPlan.findFirst.mockResolvedValue({ id: "f1" });
    db.floorPlanSection.create.mockResolvedValue(row);
    expect(
      await floorPlanSectionService.create("v1", { floorPlanId: "f1", name: "Patio" })
    ).toMatchObject({ id: "s1" });
  });

  it("strips mass-assignment keys from every write body", async () => {
    db.floorPlan.findFirst.mockResolvedValue({ id: "f1" });
    db.floorPlanSection.create.mockResolvedValue(row);
    await floorPlanSectionService.create("v1", {
      floorPlanId: "f1",
      name: "Patio",
      id: "evil",
      venueId: "evil",
    } as never);
    expect(db.floorPlanSection.create.mock.calls[0]?.[0]).toEqual({
      data: { floorPlanId: "f1", name: "Patio", venueId: "v1" },
    });

    db.floorPlanSection.updateMany.mockResolvedValue({ count: 1 });
    db.floorPlanSection.findFirst.mockResolvedValue(row);
    await floorPlanSectionService.update("v1", "s1", {
      name: "Bar",
      id: "evil",
      venueId: "evil",
      floorPlanId: "evil",
    } as never);
    expect(db.floorPlanSection.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: "s1", venueId: "v1" },
      data: { name: "Bar" },
    });
  });

  it("returns null/false for a section of another venue", async () => {
    db.floorPlanSection.updateMany.mockResolvedValue({ count: 0 });
    db.floorPlanSection.deleteMany.mockResolvedValue({ count: 0 });
    expect(await floorPlanSectionService.update("v1", "s9", { name: "x" })).toBeNull();
    expect(await floorPlanSectionService.delete("v1", "s9")).toBe(false);
    expect(whereOf(db.floorPlanSection.deleteMany)).toEqual({ id: "s9", venueId: "v1" });
  });

  it("reorders only distinct sections of the floor plan in this venue", async () => {
    expect(await floorPlanSectionService.reorder("v1", "f1", ["a", "a"])).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();

    const tx = {
      floorPlanSection: {
        count: vi.fn().mockResolvedValue(1),
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([row]),
      },
    };
    db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
    await floorPlanSectionService.reorder("v1", "f1", ["a", "b"]);
    // 1 owned of 2 requested: nothing written
    expect(tx.floorPlanSection.updateMany).not.toHaveBeenCalled();

    tx.floorPlanSection.count.mockResolvedValue(2);
    expect(await floorPlanSectionService.reorder("v1", "f1", ["a", "b"])).toHaveLength(1);
    expect(tx.floorPlanSection.updateMany).toHaveBeenCalledWith({
      where: { id: "b", floorPlanId: "f1", venueId: "v1" },
      data: { displayOrder: 1 },
    });
  });

  describe("assignTables", () => {
    const tx = {
      table: {
        count: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
    };
    beforeEach(() => {
      db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
    });

    it("returns null for an unknown section", async () => {
      db.floorPlanSection.findFirst.mockResolvedValue(null);
      expect(await floorPlanSectionService.assignTables("v1", "s9", ["t1"])).toBeNull();
    });

    it("refuses tables outside the section's floor plan and venue", async () => {
      db.floorPlanSection.findFirst.mockResolvedValue(row);
      tx.table.count.mockResolvedValue(0);
      expect(await floorPlanSectionService.assignTables("v1", "s1", ["t1"])).toBeNull();
      expect(tx.table.count).toHaveBeenCalledWith({
        where: { id: { in: ["t1"] }, venueId: "v1", floorPlanId: "f1" },
      });
      expect(tx.table.updateMany).not.toHaveBeenCalled();
    });

    it("makes the given tables the section's membership and frees the rest", async () => {
      db.floorPlanSection.findFirst.mockResolvedValue(row);
      tx.table.count.mockResolvedValue(2);
      tx.table.findMany.mockResolvedValue([]);
      await floorPlanSectionService.assignTables("v1", "s1", ["t1", "t2"]);
      expect(tx.table.updateMany).toHaveBeenNthCalledWith(1, {
        where: { venueId: "v1", sectionId: "s1", id: { notIn: ["t1", "t2"] } },
        data: { sectionId: null },
      });
      expect(tx.table.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: { in: ["t1", "t2"] }, venueId: "v1", floorPlanId: "f1" },
        data: { sectionId: "s1" },
      });
    });
  });
});
