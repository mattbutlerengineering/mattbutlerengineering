import { z } from "zod";
import { TableSchema, TableStatusSchema } from "./floor-plan.js";

export { TableSchema, TableStatusSchema };

export const ReservationStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
]);

export const OccasionSchema = z.enum([
  "birthday",
  "anniversary",
  "business",
  "date_night",
  "other",
  "none",
]);

export const SeatingPreferenceSchema = z.enum([
  "booth",
  "patio",
  "bar",
  "window",
  "quiet",
  "no_preference",
]);

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
  occasion: OccasionSchema.nullable(),
  seatingPreference: SeatingPreferenceSchema.nullable(),
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
