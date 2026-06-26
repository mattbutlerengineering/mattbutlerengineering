import { z } from "zod";

export const StaffNoteSchema = z.object({
  text: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
});

export const GuestSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  name: z.string(),
  notes: z.string().nullable(),
  visitCount: z.number(),
  noShowCount: z.number(),
  riskScore: z.enum(["trusted", "standard", "risky"]),
  lifetimeSpend: z.string().nullable(),
  lastVisit: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  dietaryRestrictions: z.array(z.string()).nullable(),
  communicationPreference: z.enum(["email_only", "sms_only", "both", "transactional_only"]),
  staffNotes: z.array(StaffNoteSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const GuestSegmentSchema = z.object({
  name: z.string(),
  description: z.string(),
  count: z.number(),
});
