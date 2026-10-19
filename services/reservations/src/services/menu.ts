import type {
  Menu,
  MenuSection,
  MenuItem,
  CreateMenuRequest,
  UpdateMenuRequest,
  CreateMenuSectionRequest,
  UpdateMenuSectionRequest,
  CreateMenuItemRequest,
  UpdateMenuItemRequest,
  PublicMenu,
  PublicMenuDetail,
} from "@mbe/types";
import {
  CreateMenuRequestSchema,
  UpdateMenuRequestSchema,
  CreateMenuSectionRequestSchema,
  UpdateMenuSectionRequestSchema,
  CreateMenuItemRequestSchema,
  UpdateMenuItemRequestSchema,
} from "@mbe/types";
import { prisma } from "./database.js";
import { setVenueContext } from "../middleware/venue-context.js";

/** A menu with its sections, each with its items — what `GET /menus/:menuId` returns. */
export type MenuWithSections = Menu & {
  sections: (MenuSection & { items: MenuItem[] })[];
};

/** A public menu detail before the route adds the venue's `currencyCode`. */
export type PublicMenuBody = Omit<PublicMenuDetail, "currencyCode">;

/** Thrown when a menu slug is already taken within the venue (`@@unique([venueId, slug])`). */
export class MenuSlugConflictError extends Error {
  constructor(slug: string) {
    super(`A menu with slug "${slug}" already exists for this venue`);
    this.name = "MenuSlugConflictError";
  }
}

interface PrismaMenu {
  id: string;
  venueId: string;
  name: string;
  slug: string;
  description: string | null;
  status: Menu["status"];
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

function mapMenu(menu: PrismaMenu): Menu {
  return {
    id: menu.id,
    venueId: menu.venueId,
    name: menu.name,
    slug: menu.slug,
    description: menu.description,
    status: menu.status,
    displayOrder: menu.displayOrder,
    createdAt: menu.createdAt.toISOString(),
    updatedAt: menu.updatedAt.toISOString(),
  };
}

function mapSection(section: MenuSection): MenuSection {
  return {
    id: section.id,
    venueId: section.venueId,
    menuId: section.menuId,
    name: section.name,
    displayOrder: section.displayOrder,
  };
}

function mapItem(item: MenuItem): MenuItem {
  return {
    id: item.id,
    venueId: item.venueId,
    sectionId: item.sectionId,
    name: item.name,
    description: item.description,
    priceCents: item.priceCents,
    status: item.status,
    displayOrder: item.displayOrder,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

/** Same ordering the guest-facing menu uses: explicit order, then name for a stable tie-break. */
const BY_ORDER = [{ displayOrder: "asc" as const }, { name: "asc" as const }];

/**
 * Every method takes the `venueId` the route already authorised and filters on
 * it explicitly, on top of the RLS backstop (ADR-026): an id belonging to
 * another venue is indistinguishable from a missing one, so callers answer 404.
 */
export const menuService = {
  async list(venueId: string): Promise<Menu[]> {
    const menus = await prisma.menu.findMany({ where: { venueId }, orderBy: BY_ORDER });
    return menus.map(mapMenu);
  },

  async getById(venueId: string, menuId: string): Promise<MenuWithSections | null> {
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, venueId },
      include: {
        sections: { orderBy: BY_ORDER, include: { items: { orderBy: BY_ORDER } } },
      },
    });
    if (!menu) return null;
    return {
      ...mapMenu(menu),
      sections: menu.sections.map((section) => ({
        ...mapSection(section),
        items: section.items.map(mapItem),
      })),
    };
  },

  async create(venueId: string, data: CreateMenuRequest): Promise<Menu> {
    try {
      // Re-parsing strips unknown keys: the route schema allows extras, and an
      // `id`/`venueId` smuggled into the body must never reach Prisma.
      const menu = await prisma.menu.create({
        data: { ...CreateMenuRequestSchema.parse(data), venueId },
      });
      return mapMenu(menu);
    } catch (err) {
      if (isUniqueViolation(err)) throw new MenuSlugConflictError(data.slug);
      throw err;
    }
  },

  async update(venueId: string, menuId: string, data: UpdateMenuRequest): Promise<Menu | null> {
    try {
      const { count } = await prisma.menu.updateMany({
        where: { id: menuId, venueId },
        data: UpdateMenuRequestSchema.parse(data),
      });
      if (count === 0) return null;
    } catch (err) {
      if (isUniqueViolation(err)) throw new MenuSlugConflictError(data.slug ?? "");
      throw err;
    }
    const menu = await prisma.menu.findFirst({ where: { id: menuId, venueId } });
    return menu ? mapMenu(menu) : null;
  },

  async delete(venueId: string, menuId: string): Promise<boolean> {
    const { count } = await prisma.menu.deleteMany({ where: { id: menuId, venueId } });
    return count > 0;
  },

  async createSection(
    venueId: string,
    menuId: string,
    data: CreateMenuSectionRequest
  ): Promise<MenuSection | null> {
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, venueId },
      select: { id: true },
    });
    if (!menu) return null;
    return mapSection(
      await prisma.menuSection.create({
        data: { ...CreateMenuSectionRequestSchema.parse(data), venueId, menuId },
      })
    );
  },

  async updateSection(
    venueId: string,
    menuId: string,
    sectionId: string,
    data: UpdateMenuSectionRequest
  ): Promise<MenuSection | null> {
    const where = { id: sectionId, menuId, venueId };
    // Allowlist via the schema: a body `menuId` would otherwise re-parent the
    // section under another venue's menu (the FK is not composite on venue_id).
    const { count } = await prisma.menuSection.updateMany({
      where,
      data: UpdateMenuSectionRequestSchema.parse(data),
    });
    if (count === 0) return null;
    const section = await prisma.menuSection.findFirst({ where });
    return section ? mapSection(section) : null;
  },

  async deleteSection(venueId: string, menuId: string, sectionId: string): Promise<boolean> {
    const { count } = await prisma.menuSection.deleteMany({
      where: { id: sectionId, menuId, venueId },
    });
    return count > 0;
  },

  async createItem(
    venueId: string,
    menuId: string,
    sectionId: string,
    data: CreateMenuItemRequest
  ): Promise<MenuItem | null> {
    const section = await prisma.menuSection.findFirst({
      where: { id: sectionId, menuId, venueId },
      select: { id: true },
    });
    if (!section) return null;
    return mapItem(
      await prisma.menuItem.create({
        data: { ...CreateMenuItemRequestSchema.parse(data), venueId, sectionId },
      })
    );
  },

  async updateItem(
    venueId: string,
    menuId: string,
    sectionId: string,
    itemId: string,
    data: UpdateMenuItemRequest
  ): Promise<MenuItem | null> {
    const where = { id: itemId, sectionId, venueId, section: { menuId } };
    // Same allowlist: a body `sectionId` must not move the item to another venue's section.
    const { count } = await prisma.menuItem.updateMany({
      where,
      data: UpdateMenuItemRequestSchema.parse(data),
    });
    if (count === 0) return null;
    const item = await prisma.menuItem.findFirst({ where });
    return item ? mapItem(item) : null;
  },

  async deleteItem(
    venueId: string,
    menuId: string,
    sectionId: string,
    itemId: string
  ): Promise<boolean> {
    const { count } = await prisma.menuItem.deleteMany({
      where: { id: itemId, sectionId, venueId, section: { menuId } },
    });
    return count > 0;
  },

  /**
   * Persists `displayOrder = index` for the given section ids. Returns `null`
   * (nothing written) unless every id is a distinct section of this menu in
   * this venue — a foreign or duplicated id fails the whole reorder.
   */
  async reorderSections(
    venueId: string,
    menuId: string,
    ids: string[]
  ): Promise<MenuSection[] | null> {
    if (new Set(ids).size !== ids.length) return null;
    // Explicit transaction: bypasses the per-call auto-wrap, so set the venue ourselves.
    return prisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      const owned = await tx.menuSection.count({ where: { id: { in: ids }, menuId, venueId } });
      if (owned !== ids.length) return null;
      for (const [displayOrder, id] of ids.entries()) {
        await tx.menuSection.updateMany({ where: { id, menuId, venueId }, data: { displayOrder } });
      }
      const sections = await tx.menuSection.findMany({
        where: { menuId, venueId },
        orderBy: BY_ORDER,
      });
      return sections.map(mapSection);
    });
  },

  /** Same contract as {@link reorderSections}, for the items of one section. */
  async reorderItems(
    venueId: string,
    menuId: string,
    sectionId: string,
    ids: string[]
  ): Promise<MenuItem[] | null> {
    if (new Set(ids).size !== ids.length) return null;
    return prisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      const section = await tx.menuSection.count({ where: { id: sectionId, menuId, venueId } });
      if (section === 0) return null;
      const owned = await tx.menuItem.count({ where: { id: { in: ids }, sectionId, venueId } });
      if (owned !== ids.length) return null;
      for (const [displayOrder, id] of ids.entries()) {
        await tx.menuItem.updateMany({ where: { id, sectionId, venueId }, data: { displayOrder } });
      }
      const items = await tx.menuItem.findMany({
        where: { sectionId, venueId },
        orderBy: BY_ORDER,
      });
      return items.map(mapItem);
    });
  },

  /** ACTIVE menus only, guest-facing fields, in display order. */
  async listPublic(venueId: string): Promise<PublicMenu[]> {
    const menus = await prisma.menu.findMany({
      where: { venueId, status: "ACTIVE" },
      orderBy: BY_ORDER,
    });
    return menus.map(({ id, name, slug, description, displayOrder }) => ({
      id,
      name,
      slug,
      description,
      displayOrder,
    }));
  },

  /** One ACTIVE menu by slug; HIDDEN items are excluded in the query, SOLD_OUT stay. */
  async getPublicBySlug(venueId: string, menuSlug: string): Promise<PublicMenuBody | null> {
    const menu = await prisma.menu.findFirst({
      where: { venueId, slug: menuSlug, status: "ACTIVE" },
      include: {
        sections: {
          orderBy: BY_ORDER,
          include: { items: { where: { status: { not: "HIDDEN" } }, orderBy: BY_ORDER } },
        },
      },
    });
    if (!menu) return null;
    return {
      id: menu.id,
      name: menu.name,
      slug: menu.slug,
      description: menu.description,
      displayOrder: menu.displayOrder,
      sections: menu.sections.map((section) => ({
        id: section.id,
        name: section.name,
        displayOrder: section.displayOrder,
        items: section.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          priceCents: item.priceCents,
          status: item.status === "SOLD_OUT" ? "SOLD_OUT" : "AVAILABLE",
          displayOrder: item.displayOrder,
        })),
      })),
    };
  },
};
