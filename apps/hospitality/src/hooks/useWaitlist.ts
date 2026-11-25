import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CreateWaitlistEntryRequest, WaitlistEntry } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";

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

/**
 * Refreshes what a seating touches: the waitlist row is gone (the server marks it seated inside the
 * walk-in's own transaction, #9606) and a walk-in reservation exists, so "View on Timeline" must
 * not land on a stale list. Also run when the server says the party was already seated.
 */
export function useRefreshWaitlist(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    for (const key of [WAITLIST_QUERY_KEY, RESERVATIONS_QUERY_KEY]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);
}

export const useNotifyWaitlistEntry = createMutationHook<string, WaitlistEntry>({
  invalidateKeys: WAITLIST_QUERY_KEY,
  mutationFn: (api, id) => api.waitlist.notify(id),
});

export const useCancelWaitlistEntry = createMutationHook<string, WaitlistEntry>({
  invalidateKeys: WAITLIST_QUERY_KEY,
  mutationFn: (api, id) => api.waitlist.cancel(id),
});
