import type { CreateWaitlistEntryRequest, WaitlistEntry } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";

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

/* ── Mutations ───────────────────────────────────── */

export const useCreateWaitlistEntry = createMutationHook<CreateWaitlistEntryRequest, WaitlistEntry>(
  {
    invalidateKeys: WAITLIST_QUERY_KEY,
    mutationFn: (api, data) => api.waitlist.create(data),
  }
);

export const useNotifyWaitlistEntry = createMutationHook<string, WaitlistEntry>({
  invalidateKeys: WAITLIST_QUERY_KEY,
  mutationFn: (api, id) => api.waitlist.notify(id),
});

export const useCancelWaitlistEntry = createMutationHook<string, WaitlistEntry>({
  invalidateKeys: WAITLIST_QUERY_KEY,
  mutationFn: (api, id) => api.waitlist.cancel(id),
});
