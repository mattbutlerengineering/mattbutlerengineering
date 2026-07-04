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
  durationMinutes: z.number().optional(),
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

export const DepositStatusSchema = z.enum([
  "pending",
  "held",
  "applied",
  "refunded",
  "partial_refunded",
  "forfeited",
]);

export const DepositSchema = z.object({
  id: z.string(),
  reservationId: z.string(),
  amountCents: z.number(),
  currency: z.string(),
  status: DepositStatusSchema,
  stripePaymentIntentId: z.string().nullable(),
  stripeCustomerId: z.string().nullable(),
  heldAt: z.string().nullable(),
  appliedAt: z.string().nullable(),
  refundedAt: z.string().nullable(),
  forfeitedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
