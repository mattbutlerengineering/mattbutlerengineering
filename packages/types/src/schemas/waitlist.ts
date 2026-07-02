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
