import { z } from "zod";
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
} from "@mbe/types";
import { MenuSchema, MenuSectionSchema, MenuItemSchema } from "@mbe/types";
import type { ApiClient } from "./client.js";

/** A menu with its sections, each with its items — what `GET /menus/:menuId` returns. */
export type MenuWithSections = Menu & {
  sections: (MenuSection & { items: MenuItem[] })[];
};

const MenuWithSectionsSchema: z.ZodSchema<MenuWithSections> = MenuSchema.extend({
  sections: z.array(MenuSectionSchema.extend({ items: z.array(MenuItemSchema) })),
});

const menuListSchema = z.object({ data: z.array(MenuSchema) });
const sectionListSchema = z.array(MenuSectionSchema);
const itemListSchema = z.array(MenuItemSchema);

/**
 * Operator menu management. Every route is venue-scoped through `?venueId=`,
 * so every method takes the venue first; paths match `routes/menus.ts` exactly.
 */
export class MenusClient {
  constructor(private client: ApiClient) {}

  private menuPath(venueId: string, menuId?: string, ...rest: string[]): string {
    const segments = menuId === undefined ? [] : [menuId, ...rest];
    const path = ["/api/v1/menus", ...segments.map(encodeURIComponent)].join("/");
    return `${path}?venueId=${encodeURIComponent(venueId)}`;
  }

  async list(venueId: string): Promise<Menu[]> {
    const response = await this.client.get<{ data: Menu[] }>(
      this.menuPath(venueId),
      undefined,
      menuListSchema
    );
    return response.data;
  }

  async getById(venueId: string, menuId: string): Promise<MenuWithSections> {
    return this.client.getOne<MenuWithSections>(
      this.menuPath(venueId, menuId),
      undefined,
      MenuWithSectionsSchema
    );
  }

  async create(venueId: string, data: CreateMenuRequest): Promise<Menu> {
    return this.client.postOne<Menu>(this.menuPath(venueId), data, MenuSchema);
  }

  async update(venueId: string, menuId: string, data: UpdateMenuRequest): Promise<Menu> {
    return this.client.patchOne<Menu>(this.menuPath(venueId, menuId), data, MenuSchema);
  }

  async delete(venueId: string, menuId: string): Promise<void> {
    return this.client.delete(this.menuPath(venueId, menuId));
  }

  async createSection(
    venueId: string,
    menuId: string,
    data: CreateMenuSectionRequest
  ): Promise<MenuSection> {
    return this.client.postOne<MenuSection>(
      this.menuPath(venueId, menuId, "sections"),
      data,
      MenuSectionSchema
    );
  }

  async updateSection(
    venueId: string,
    menuId: string,
    sectionId: string,
    data: UpdateMenuSectionRequest
  ): Promise<MenuSection> {
    return this.client.patchOne<MenuSection>(
      this.menuPath(venueId, menuId, "sections", sectionId),
      data,
      MenuSectionSchema
    );
  }

  async deleteSection(venueId: string, menuId: string, sectionId: string): Promise<void> {
    return this.client.delete(this.menuPath(venueId, menuId, "sections", sectionId));
  }

  /** Persists `displayOrder` as each id's index (`PUT /:menuId/sections/order`). */
  async reorderSections(venueId: string, menuId: string, ids: string[]): Promise<MenuSection[]> {
    return this.client.putOne<MenuSection[]>(
      this.menuPath(venueId, menuId, "sections", "order"),
      { ids },
      sectionListSchema
    );
  }

  async createItem(
    venueId: string,
    menuId: string,
    sectionId: string,
    data: CreateMenuItemRequest
  ): Promise<MenuItem> {
    return this.client.postOne<MenuItem>(
      this.menuPath(venueId, menuId, "sections", sectionId, "items"),
      data,
      MenuItemSchema
    );
  }

  async updateItem(
    venueId: string,
    menuId: string,
    sectionId: string,
    itemId: string,
    data: UpdateMenuItemRequest
  ): Promise<MenuItem> {
    return this.client.patchOne<MenuItem>(
      this.menuPath(venueId, menuId, "sections", sectionId, "items", itemId),
      data,
      MenuItemSchema
    );
  }

  async deleteItem(
    venueId: string,
    menuId: string,
    sectionId: string,
    itemId: string
  ): Promise<void> {
    return this.client.delete(
      this.menuPath(venueId, menuId, "sections", sectionId, "items", itemId)
    );
  }

  /** Persists `displayOrder` as each id's index (`PUT .../items/order`). */
  async reorderItems(
    venueId: string,
    menuId: string,
    sectionId: string,
    ids: string[]
  ): Promise<MenuItem[]> {
    return this.client.putOne<MenuItem[]>(
      this.menuPath(venueId, menuId, "sections", sectionId, "items", "order"),
      { ids },
      itemListSchema
    );
  }
}
