import type { LostDemandWhatIf } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";

export interface UseLostDemandWhatIfParams {
  venueId: string;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** Candidate seating time, 24-hour "HH:MM", venue-local. */
  time: string;
  minParty?: number;
  maxParty?: number;
}

/**
 * Estimate of the turned-away searches a new seating would have served (read-only).
 * No previous-key placeholder: a changed pick must show loading, never the last pick's number.
 */
export const useLostDemandWhatIf = createQueryHook<
  LostDemandWhatIf | null,
  UseLostDemandWhatIfParams
>({
  key: "lost-demand-what-if",
  fetcher: async (params, api) => {
    if (!params) return null;
    return api.reservations.getLostDemandWhatIf(params);
  },
  getEnabled: (params) => Boolean(params?.venueId),
});
