import { z } from "zod";

export const MenuStatusSchema = z.enum(["DRAFT", "ACTIVE", "INACTIVE"]);
export const MenuItemStatusSchema = z.enum(["AVAILABLE", "SOLD_OUT", "HIDDEN"]);

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const PriceCentsSchema = z.number().int().nonnegative();

export const MenuSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: MenuStatusSchema,
  displayOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const MenuSectionSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  menuId: z.string(),
  name: z.string(),
  displayOrder: z.number().int(),
});

export const MenuItemSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  sectionId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: PriceCentsSchema,
  status: MenuItemStatusSchema,
  displayOrder: z.number().int(),
});

export const CreateMenuRequestSchema = z.object({
  name: z.string().min(1),
  slug: SlugSchema,
  description: z.string().nullable().optional(),
  status: MenuStatusSchema.optional(),
  displayOrder: z.number().int().optional(),
});

export const UpdateMenuRequestSchema = CreateMenuRequestSchema.partial();

export const CreateMenuSectionRequestSchema = z.object({
  name: z.string().min(1),
  displayOrder: z.number().int().optional(),
});

export const UpdateMenuSectionRequestSchema = CreateMenuSectionRequestSchema.partial();

export const CreateMenuItemRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  priceCents: PriceCentsSchema,
  status: MenuItemStatusSchema.optional(),
  displayOrder: z.number().int().optional(),
});

export const UpdateMenuItemRequestSchema = CreateMenuItemRequestSchema.partial();

export type MenuStatus = z.infer<typeof MenuStatusSchema>;
export type MenuItemStatus = z.infer<typeof MenuItemStatusSchema>;
export type Menu = z.infer<typeof MenuSchema>;
export type MenuSection = z.infer<typeof MenuSectionSchema>;
export type MenuItem = z.infer<typeof MenuItemSchema>;
export type CreateMenuRequest = z.infer<typeof CreateMenuRequestSchema>;
export type UpdateMenuRequest = z.infer<typeof UpdateMenuRequestSchema>;
export type CreateMenuSectionRequest = z.infer<typeof CreateMenuSectionRequestSchema>;
export type UpdateMenuSectionRequest = z.infer<typeof UpdateMenuSectionRequestSchema>;
export type CreateMenuItemRequest = z.infer<typeof CreateMenuItemRequestSchema>;
export type UpdateMenuItemRequest = z.infer<typeof UpdateMenuItemRequestSchema>;

/** Every operator menu route names its venue in the query string. */
export const MenuVenueQuerySchema = z.object({ venueId: z.string().min(1) });

/** Ids in their new order; the position in the array becomes `displayOrder`. */
export const ReorderMenuRequestSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

export type ReorderMenuRequest = z.infer<typeof ReorderMenuRequestSchema>;
