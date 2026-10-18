import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  const delegate = () => ({ findMany: vi.fn(), findFirst: vi.fn() });
  return createMockDatabaseService({ prisma: { menu: delegate() } });
});

import { prisma } from "./database.js";
import { menuService } from "./menu.js";

const db = prisma as unknown as { menu: { findMany: Mock; findFirst: Mock } };

describe("menuService public reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listPublic returns only ACTIVE menus of the venue, in display order, as public fields", async () => {
    db.menu.findMany.mockResolvedValueOnce([
      {
        id: "m1",
        venueId: "v1",
        name: "Dinner",
        slug: "dinner",
        description: null,
        status: "ACTIVE",
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await menuService.listPublic("v1");

    expect(db.menu.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { venueId: "v1", status: "ACTIVE" } })
    );
    expect(result).toEqual([
      { id: "m1", name: "Dinner", slug: "dinner", description: null, displayOrder: 0 },
    ]);
  });

  it("getPublicBySlug filters ACTIVE menus and excludes HIDDEN items in the query", async () => {
    db.menu.findFirst.mockResolvedValueOnce(null);

    expect(await menuService.getPublicBySlug("v1", "draft")).toBeNull();

    const args = db.menu.findFirst.mock.calls[0]![0] as {
      where: unknown;
      include: { sections: { include: { items: { where: unknown } } } };
    };
    expect(args.where).toEqual({ venueId: "v1", slug: "draft", status: "ACTIVE" });
    expect(args.include.sections.include.items.where).toEqual({ status: { not: "HIDDEN" } });
  });

  it("getPublicBySlug maps sections and items to public fields only", async () => {
    db.menu.findFirst.mockResolvedValueOnce({
      id: "m1",
      venueId: "v1",
      name: "Dinner",
      slug: "dinner",
      description: null,
      status: "ACTIVE",
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      sections: [
        {
          id: "s1",
          venueId: "v1",
          menuId: "m1",
          name: "Starters",
          displayOrder: 0,
          items: [
            {
              id: "i1",
              venueId: "v1",
              sectionId: "s1",
              name: "Soup",
              description: null,
              priceCents: 850,
              status: "AVAILABLE",
              displayOrder: 0,
            },
          ],
        },
      ],
    });

    const result = await menuService.getPublicBySlug("v1", "dinner");

    expect(result).toEqual({
      id: "m1",
      name: "Dinner",
      slug: "dinner",
      description: null,
      displayOrder: 0,
      sections: [
        {
          id: "s1",
          name: "Starters",
          displayOrder: 0,
          items: [
            {
              id: "i1",
              name: "Soup",
              description: null,
              priceCents: 850,
              status: "AVAILABLE",
              displayOrder: 0,
            },
          ],
        },
      ],
    });
  });
});
