import { z } from "zod";

export const TableShapeMetadataSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().optional(),
  shape: z.enum(["rectangle", "circle", "square"]),
  color: z.string().optional(),
});

export const WallLayoutSchema = z.object({
  id: z.string(),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  thickness: z.number().positive(),
  wallType: z.enum(["wall", "window"]).optional(),
});

/** A section's painted zone on the canvas; `id` is the `FloorPlanSection` row it draws. */
export const SectionLayoutSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const FloorPlanLayoutSchema = z.object({
  width: z.number(),
  height: z.number(),
  backgroundImage: z.string().optional(),
  gridSize: z.number().optional(),
  showGrid: z.boolean().optional(),
  walls: z.array(WallLayoutSchema).optional(),
  sections: z.array(SectionLayoutSchema).optional(),
});

export const TableStatusSchema = z.enum(["AVAILABLE", "OCCUPIED", "DIRTY", "READY"]);

export const TableSchema = z.object({
  id: z.string(),
  name: z.string(),
  tableNumber: z.string().nullable(),
  capacity: z.number(),
  minCovers: z.number(),
  maxCovers: z.number().nullable(),
  location: z.string().nullable(),
  isActive: z.boolean(),
  priority: z.number(),
  status: TableStatusSchema,
  venueId: z.string().nullable(),
  floorPlanId: z.string().nullable(),
  sectionId: z.string().nullable().optional(),
  shapeMetadata: TableShapeMetadataSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const FloorPlanSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  layoutJson: FloorPlanLayoutSchema,
  tables: z.array(TableSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
