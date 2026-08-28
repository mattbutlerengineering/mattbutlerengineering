import type { WaitlistEntry } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";

export const WAITLIST_QUERY_KEY = "waitlist" as const;

export interface UseWaitlistParams {
  venueId: string;
}

export const useWaitlist = createQueryHook<WaitlistEntry[], UseWaitlistParams>({
  key: WAITLIST_QUERY_KEY,
  fetcher: async (params, api) => {
    if (!params) return [];
    return api.waitlist.list(params.venueId);
  },
  getEnabled: (params) => Boolean(params?.venueId),
});
