import { z } from "zod";

/**
 * Response shapes of the availability listing routes, computed by the
 * availability engine (docs/features/venue-availability/architecture.md §
 * Reservations HTTP). The pre-engine shape is unchanged; the engine adds a
 * per-date `closure` and a venue-level `bookingPaused`.
 */

export const AvailableTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number().int(),
  minCovers: z.number().int(),
  maxCovers: z.number().int().nullable(),
});

export const TimeSlotSchema = z.object({
  time: z.string(),
  available: z.boolean(),
  tables: z.array(AvailableTableSchema).optional(),
});

/** The date is closed; `message` is the Manager's message for guests, or a default. */
export const AvailabilityClosureSchema = z.object({
  message: z.string().min(1),
});

/** Online booking is paused until the venue reopens it; `phone` only while phone booking is open. */
export const BookingPausedSchema = z.object({
  message: z.string().min(1),
  phone: z.string().optional(),
});

export const DateAvailabilitySchema = z.object({
  date: z.string(),
  hasAvailability: z.boolean(),
  slotCount: z.number().int().optional(),
  closure: AvailabilityClosureSchema.optional(),
});

/** One closed date in the public dates listing. */
export const PublicClosedDateSchema = z.object({
  date: z.string(),
  closure: AvailabilityClosureSchema,
});

/** `GET /public/v1/venues/:slug/availability/dates`: only the dates that are closed. */
export const PublicAvailabilityDatesResponseSchema = z.object({
  data: z.array(PublicClosedDateSchema),
});

/** `GET /public/v1/venues/:slug/availability`. */
export const PublicAvailabilityResponseSchema = z.object({
  data: z.array(TimeSlotSchema),
  closure: AvailabilityClosureSchema.optional(),
  bookingPaused: BookingPausedSchema.optional(),
});

export type PublicClosedDate = z.infer<typeof PublicClosedDateSchema>;
export type PublicAvailabilityDatesResponse = z.infer<typeof PublicAvailabilityDatesResponseSchema>;
export type AvailabilityClosure = z.infer<typeof AvailabilityClosureSchema>;
export type BookingPaused = z.infer<typeof BookingPausedSchema>;
export type PublicAvailabilityResponse = z.infer<typeof PublicAvailabilityResponseSchema>;
