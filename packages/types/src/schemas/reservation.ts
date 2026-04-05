import { z } from "zod";
import { TableShapeMetadataSchema } from "./floor-plan.js";

export const ReservationStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
]);

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
  shapeMetadata: TableShapeMetadataSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ReservationSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  partySize: z.number(),
  status: ReservationStatusSchema,
  notes: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  cancellationNote: z.string().nullable(),
  guestName: z.string().nullable(),
  guestEmail: z.string().nullable(),
  guestPhone: z.string().nullable(),
  guestId: z.string().nullable(),
  userId: z.string().nullable(),
  tableId: z.string(),
  table: TableSchema.optional(),
  venueId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
