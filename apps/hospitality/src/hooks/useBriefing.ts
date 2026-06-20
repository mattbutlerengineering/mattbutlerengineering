import type { ApiBriefingEntry, ApiBriefingGuest } from "@mbe/api-client";
import { createQueryHook } from "./create-query-hook.js";

export const BRIEFING_QUERY_KEY = "briefing" as const;

// Re-export api-client types under the names consumers already import
export type BriefingGuest = ApiBriefingGuest;
export type BriefingEntry = ApiBriefingEntry;

export interface UseBriefingParams {
  date: string;
  venueId: string;
  enabled?: boolean;
}

export const useBriefing = createQueryHook<BriefingEntry[], UseBriefingParams>({
  key: BRIEFING_QUERY_KEY,
  fetcher: async (params, api) => {
    if (!params) return [];
    return api.briefing.list({ date: params.date, venueId: params.venueId });
  },
  getEnabled: (params) => Boolean(params?.date && params?.venueId),
});
