import { z } from "zod";

export const DayScheduleSchema = z.object({
  open: z.string(),
  close: z.string(),
  closed: z.boolean().optional(),
});

export const VenueGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

export const VenueSchema = z.object({
  id: z.string(),
  venueGroupId: z.string().nullable(),
  venueGroup: VenueGroupSchema.optional(),
  name: z.string(),
  slug: z.string(),
  ianaTimezone: z.string(),
  currencyCode: z.string(),
  operatingHours: z
    .object({
      monday: DayScheduleSchema.optional(),
      tuesday: DayScheduleSchema.optional(),
      wednesday: DayScheduleSchema.optional(),
      thursday: DayScheduleSchema.optional(),
      friday: DayScheduleSchema.optional(),
      saturday: DayScheduleSchema.optional(),
      sunday: DayScheduleSchema.optional(),
    })
    .nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Curated public projection of `VenueSchema` — see `PublicVenue` (#4022). */
export const PublicVenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  operatingHours: VenueSchema.shape.operatingHours,
});

export const PublicVenueDepositSchema = z.object({
  enabled: z.boolean(),
  depositType: z.enum(["flat", "per_person"]).nullable(),
  amountCents: z.number().nullable(),
  freeCancellationHours: z.number().nullable(),
  lateCancellationFeePercent: z.number().nullable(),
  noShowFeePercent: z.number().nullable(),
});

export const PublicVenueConfigSchema = z.object({
  name: z.string(),
  slug: z.string(),
  ianaTimezone: z.string(),
  currencyCode: z.string(),
  operatingHours: VenueSchema.shape.operatingHours,
  settings: z.object({
    defaultReservationDuration: z.number().optional(),
    maxPartySize: z.number().optional(),
    maxAdvanceBooking: z.number().optional(),
    slotIntervalMinutes: z.number().optional(),
  }),
  deposit: PublicVenueDepositSchema,
});

export const DepositPaymentIntentSchema = z.object({
  clientSecret: z.string(),
  depositId: z.string(),
  amountCents: z.number(),
  currency: z.string(),
});
