import { z } from "zod";

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * The floor finishes a section can be painted with. Each one has a committed
 * 64x64 tiling texture served from `apps/hospitality/public/floor-plan/textures`;
 * adding a material here without its PNG is caught by that app's asset guard.
 */
export const FLOOR_MATERIALS = ["hardwood", "concrete", "carpet", "tile", "marble"] as const;

export const FloorMaterialSchema = z.enum(FLOOR_MATERIALS);

/** A floor-plan section row. Its zone rectangle lives in the plan's `layoutJson.sections`. */
export const FloorPlanSectionSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  floorPlanId: z.string(),
  name: z.string(),
  color: z.string(),
  displayOrder: z.number().int(),
  /**
   * `null` means no floor finish: the zone renders exactly as it did before
   * materials existed. Absent is tolerated too, so a client deployed ahead of
   * the service still parses a response from before the column existed.
   */
  floorMaterial: FloorMaterialSchema.nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateFloorPlanSectionRequestSchema = z.object({
  floorPlanId: z.string().min(1),
  name: z.string().min(1),
  color: HexColorSchema.optional(),
  displayOrder: z.number().int().optional(),
  /** Explicit `null` clears the floor finish; omitted leaves it untouched. */
  floorMaterial: FloorMaterialSchema.nullable().optional(),
});

/** Rename, recolour or move one section. `floorPlanId` is deliberately absent: a section never re-parents. */
export const UpdateFloorPlanSectionRequestSchema = CreateFloorPlanSectionRequestSchema.omit({
  floorPlanId: true,
}).partial();

/** Ids in their new order; the position in the array becomes `displayOrder`. */
export const ReorderFloorPlanSectionsRequestSchema = z.object({
  floorPlanId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
});

/** The tables that belong to a section; every other table leaves it. An empty list clears it. */
export const AssignSectionTablesRequestSchema = z.object({ tableIds: z.array(z.string().min(1)) });

/** Every section route names its venue in the query string; the list may narrow to one floor plan. */
export const FloorPlanSectionListQuerySchema = z.object({
  venueId: z.string().min(1),
  floorPlanId: z.string().min(1).optional(),
});

export const FloorPlanSectionVenueQuerySchema = z.object({ venueId: z.string().min(1) });

export type FloorMaterial = z.infer<typeof FloorMaterialSchema>;
export type FloorPlanSection = z.infer<typeof FloorPlanSectionSchema>;
export type CreateFloorPlanSectionRequest = z.infer<typeof CreateFloorPlanSectionRequestSchema>;
export type UpdateFloorPlanSectionRequest = z.infer<typeof UpdateFloorPlanSectionRequestSchema>;
export type ReorderFloorPlanSectionsRequest = z.infer<typeof ReorderFloorPlanSectionsRequestSchema>;
export type AssignSectionTablesRequest = z.infer<typeof AssignSectionTablesRequestSchema>;
