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

export const FloorPlanLayoutSchema = z.object({
  width: z.number(),
  height: z.number(),
  backgroundImage: z.string().optional(),
  gridSize: z.number().optional(),
  showGrid: z.boolean().optional(),
});

export const FloorPlanSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  layoutJson: FloorPlanLayoutSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
