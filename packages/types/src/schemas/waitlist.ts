import { z } from "zod";

export const WaitlistJoinRequestSchema = z.object({
  venueId: z.string(),
  partySize: z.number(),
  guestName: z.string(),
  guestPhone: z.string(),
});

export const WaitlistJoinResultSchema = z.object({
  position: z.number(),
  estimatedWaitMinutes: z.number(),
});

export const WaitlistStatusSchema = z.enum([
  "waiting",
  "notified",
  "seated",
  "expired",
  "cancelled",
]);

export const WaitlistEntrySchema = z.object({
  id: z.string(),
  venueId: z.string(),
  partySize: z.number(),
  guestName: z.string(),
  guestPhone: z.string(),
  position: z.number(),
  estimatedWaitMinutes: z.number(),
  status: WaitlistStatusSchema,
  notifiedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
