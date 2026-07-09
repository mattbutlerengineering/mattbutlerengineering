import type { VenueSettings } from "@mbe/types";
import { computeGuestRisk, resolveNoShowThreshold, type GuestRiskScore } from "./guest-risk.js";

/**
 * Minimal guest shape needed to assess reliability. Structurally satisfied by
 * both the raw Prisma row (`lastNoShowAt: Date`) and the mapped `Guest`
 * domain type (`lastNoShowAt: string`), so either caller can pass its guest
 * straight through without reshaping it.
 */
export interface GuestReliabilityInput {
  noShowCount: number;
  visitCount: number;
  lastNoShowAt?: Date | string | null;
}

/**
 * Assesses whether a guest is risky, from the whole Guest and the venue's
 * settings. Owns field selection (`lastNoShowAt`), threshold resolution
 * (`autoDepositAfterNoShows`, via the shared `resolveNoShowThreshold`
 * default), and the decay rule — callers can no longer feed it the wrong
 * date or duplicate the threshold default (#3230). The pure computation
 * (`computeGuestRisk`) stays internal to this module.
 */
export function assessGuestReliability(
  guest: GuestReliabilityInput,
  venueSettings: VenueSettings | null | undefined
): GuestRiskScore {
  const lastNoShowDate = guest.lastNoShowAt ? new Date(guest.lastNoShowAt) : null;
  const threshold = resolveNoShowThreshold(venueSettings);
  return computeGuestRisk(guest.noShowCount, guest.visitCount, lastNoShowDate, {
    riskyThreshold: threshold,
  });
}
