import { z } from "zod";

export const GuestSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  name: z.string(),
  notes: z.string().nullable(),
  visitCount: z.number(),
  lifetimeSpend: z.string().nullable(),
  lastVisit: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  dietaryRestrictions: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const GuestSegmentSchema = z.object({
  name: z.string(),
  description: z.string(),
  count: z.number(),
});
