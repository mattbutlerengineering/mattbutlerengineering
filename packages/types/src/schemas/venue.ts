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
