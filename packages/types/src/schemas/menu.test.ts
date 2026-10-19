import { describe, expect, it } from "vitest";
import {
  CreateMenuItemRequestSchema,
  CreateMenuRequestSchema,
  CreateMenuSectionRequestSchema,
  MenuItemSchema,
  MenuSchema,
  MenuSectionSchema,
  MenuStatusSchema,
  UpdateMenuItemRequestSchema,
  UpdateMenuRequestSchema,
  UpdateMenuSectionRequestSchema,
} from "./menu.js";

const ts = "2026-10-18T00:00:00.000Z";

describe("menu schemas", () => {
  it("accepts a valid menu", () => {
    const menu = {
      id: "m1",
      venueId: "v1",
      name: "Dinner",
      slug: "dinner",
      description: null,
      status: "DRAFT",
      displayOrder: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    expect(MenuSchema.parse(menu)).toEqual(menu);
  });

  it("rejects unknown menu statuses", () => {
    expect(MenuStatusSchema.safeParse("PUBLISHED").success).toBe(false);
    expect(
      CreateMenuRequestSchema.safeParse({ name: "Dinner", slug: "dinner", status: "PUBLISHED" })
        .success
    ).toBe(false);
  });

  it("accepts a valid section", () => {
    const section = { id: "s1", venueId: "v1", menuId: "m1", name: "Starters", displayOrder: 1 };
    expect(MenuSectionSchema.parse(section)).toEqual(section);
  });

  it("accepts a valid item and rejects unknown item statuses", () => {
    const item = {
      id: "i1",
      venueId: "v1",
      sectionId: "s1",
      name: "Soup",
      description: null,
      priceCents: 850,
      status: "AVAILABLE",
      displayOrder: 0,
    };
    expect(MenuItemSchema.parse(item)).toEqual(item);
    expect(MenuItemSchema.safeParse({ ...item, status: "GONE" }).success).toBe(false);
  });

  it("rejects negative or fractional prices", () => {
    expect(
      MenuItemSchema.safeParse({
        id: "i1",
        venueId: "v1",
        sectionId: "s1",
        name: "Soup",
        description: null,
        priceCents: -1,
        status: "AVAILABLE",
        displayOrder: 0,
      }).success
    ).toBe(false);
    expect(CreateMenuItemRequestSchema.safeParse({ name: "Soup", priceCents: -1 }).success).toBe(
      false
    );
    expect(CreateMenuItemRequestSchema.safeParse({ name: "Soup", priceCents: 1.5 }).success).toBe(
      false
    );
    expect(UpdateMenuItemRequestSchema.safeParse({ priceCents: -5 }).success).toBe(false);
    expect(CreateMenuItemRequestSchema.safeParse({ name: "Soup", priceCents: 0 }).success).toBe(
      true
    );
  });

  it("create/update requests validate required fields and slug format", () => {
    expect(CreateMenuRequestSchema.safeParse({ name: "", slug: "dinner" }).success).toBe(false);
    expect(CreateMenuRequestSchema.safeParse({ name: "Dinner", slug: "Not A Slug" }).success).toBe(
      false
    );
    expect(CreateMenuRequestSchema.safeParse({ name: "Dinner", slug: "dinner" }).success).toBe(
      true
    );
    expect(UpdateMenuRequestSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    expect(CreateMenuSectionRequestSchema.safeParse({ name: "" }).success).toBe(false);
    expect(UpdateMenuSectionRequestSchema.safeParse({ name: "Mains" }).success).toBe(true);
  });
});
