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
      menu: delegate(),
      menuSection: delegate(),
      menuItem: delegate(),
      $transaction: vi.fn(),
    },
  });
});

vi.mock("../middleware/venue-context.js", () => ({ setVenueContext: vi.fn() }));

import { menuService, MenuSlugConflictError } from "./menu.js";
import { prisma } from "./database.js";

type Delegate = Record<
  "findMany" | "findFirst" | "create" | "updateMany" | "deleteMany" | "count",
  Mock
>;
const db = prisma as unknown as {
  menu: Delegate;
  menuSection: Delegate;
  menuItem: Delegate;
  $transaction: Mock;
};

/** The `where` of the nth call's first argument. */
function whereOf(mock: Mock, call = 0): unknown {
  return (mock.mock.calls[call]?.[0] as { where: unknown }).where;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("menuService", () => {
  it("filters every menu read and write by venueId", async () => {
    db.menu.findFirst.mockResolvedValue(null);
    db.menu.updateMany.mockResolvedValue({ count: 0 });
    db.menu.deleteMany.mockResolvedValue({ count: 0 });

    expect(await menuService.getById("v1", "m1")).toBeNull();
    expect(await menuService.update("v1", "m1", { name: "x" })).toBeNull();
    expect(await menuService.delete("v1", "m1")).toBe(false);

    expect(whereOf(db.menu.findFirst)).toEqual({ id: "m1", venueId: "v1" });
    expect(whereOf(db.menu.updateMany)).toEqual({ id: "m1", venueId: "v1" });
    expect(whereOf(db.menu.deleteMany)).toEqual({ id: "m1", venueId: "v1" });
  });

  it("maps a duplicate (venueId, slug) to MenuSlugConflictError", async () => {
    db.menu.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(
      menuService.create("v1", { name: "Dinner", slug: "dinner" })
    ).rejects.toBeInstanceOf(MenuSlugConflictError);
  });

  it("rethrows unrelated create errors", async () => {
    db.menu.create.mockRejectedValue(new Error("boom"));
    await expect(menuService.create("v1", { name: "Dinner", slug: "dinner" })).rejects.toThrow(
      "boom"
    );
  });

  it("stamps the venueId on created sections and refuses a menu outside the venue", async () => {
    db.menu.findFirst.mockResolvedValueOnce(null);
    expect(await menuService.createSection("v1", "other", { name: "x" })).toBeNull();
    expect(whereOf(db.menu.findFirst)).toEqual({ id: "other", venueId: "v1" });
    expect(db.menuSection.create).not.toHaveBeenCalled();
  });

  it("refuses a reorder with duplicated ids without touching the database", async () => {
    expect(await menuService.reorderSections("v1", "m1", ["a", "a"])).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("reorder writes displayOrder = index, all scoped to the venue", async () => {
    const tx = {
      menuSection: {
        count: vi.fn().mockResolvedValue(2),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    db.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));

    await menuService.reorderSections("v1", "m1", ["s2", "s1"]);

    expect(tx.menuSection.count.mock.calls[0]?.[0].where).toEqual({
      id: { in: ["s2", "s1"] },
      menuId: "m1",
      venueId: "v1",
    });
    expect(tx.menuSection.updateMany.mock.calls.map((c) => [c[0]?.where, c[0]?.data])).toEqual([
      [{ id: "s2", menuId: "m1", venueId: "v1" }, { displayOrder: 0 }],
      [{ id: "s1", menuId: "m1", venueId: "v1" }, { displayOrder: 1 }],
    ]);
  });

  it("reorder writes nothing when an id is not owned by the menu in this venue", async () => {
    const tx = {
      menuSection: { count: vi.fn().mockResolvedValue(1), updateMany: vi.fn(), findMany: vi.fn() },
    };
    db.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));

    expect(await menuService.reorderSections("v1", "m1", ["s1", "foreign"])).toBeNull();
    expect(tx.menuSection.updateMany).not.toHaveBeenCalled();
  });

  it("item mutations are confined to the section, its menu and the venue", async () => {
    db.menuItem.updateMany.mockResolvedValue({ count: 0 });
    db.menuItem.deleteMany.mockResolvedValue({ count: 0 });

    expect(await menuService.updateItem("v1", "m1", "s1", "i1", { name: "x" })).toBeNull();
    expect(await menuService.deleteItem("v1", "m1", "s1", "i1")).toBe(false);

    const where = { id: "i1", sectionId: "s1", venueId: "v1", section: { menuId: "m1" } };
    expect(whereOf(db.menuItem.updateMany)).toEqual(where);
    expect(whereOf(db.menuItem.deleteMany)).toEqual(where);
  });

  it("drops body keys that would move a row across venues (mass assignment)", async () => {
    const evil = { name: "x", id: "forged", venueId: "B", menuId: "B-menu", sectionId: "B-sec" };
    db.menuSection.updateMany.mockResolvedValue({ count: 0 });
    db.menuItem.updateMany.mockResolvedValue({ count: 0 });
    db.menu.updateMany.mockResolvedValue({ count: 0 });

    await menuService.updateSection("A", "m1", "s1", evil as never);
    await menuService.updateItem("A", "m1", "s1", "i1", evil as never);
    await menuService.update("A", "m1", evil as never);

    for (const mock of [db.menuSection.updateMany, db.menuItem.updateMany, db.menu.updateMany]) {
      expect((mock.mock.calls[0]?.[0] as { data: unknown }).data).toEqual({ name: "x" });
    }
  });

  it("create ignores forged id and ownership keys in the body", async () => {
    db.menu.findFirst.mockResolvedValue({ id: "m1" });
    db.menuSection.findFirst.mockResolvedValue({ id: "s1" });
    db.menu.create.mockResolvedValue({ id: "new" });
    db.menuSection.create.mockResolvedValue({ id: "new" });
    db.menuItem.create.mockResolvedValue({ id: "new" });
    const evil = { name: "x", id: "forged", venueId: "B", menuId: "B-menu", sectionId: "B-sec" };

    await menuService.create("A", { ...evil, slug: "x" } as never).catch(() => undefined);
    await menuService.createSection("A", "m1", evil as never).catch(() => undefined);
    await menuService
      .createItem("A", "m1", "s1", { ...evil, priceCents: 1 } as never)
      .catch(() => undefined);

    const created = (m: Mock) => (m.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(created(db.menu.create)).toEqual({ name: "x", slug: "x", venueId: "A" });
    expect(created(db.menuSection.create)).toEqual({ name: "x", venueId: "A", menuId: "m1" });
    expect(created(db.menuItem.create)).toEqual({
      name: "x",
      priceCents: 1,
      venueId: "A",
      sectionId: "s1",
    });
  });
});
