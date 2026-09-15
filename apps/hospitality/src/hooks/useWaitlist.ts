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

// Seating a party means a walk-in reservation now exists (WaitlistPage creates it just before),
// so the reservations list is stale too — the Waitlist's "View on Timeline" must show the party
// (the Timeline's own walk-in path does the same through invalidateAll).
export const useSeatWaitlistEntry = createMutationHook<string, WaitlistEntry>({
  invalidateKeys: [WAITLIST_QUERY_KEY, RESERVATIONS_QUERY_KEY],
  mutationFn: (api, id) => api.waitlist.seat(id),
});

export const useNotifyWaitlistEntry = createMutationHook<string, WaitlistEntry>({
  invalidateKeys: WAITLIST_QUERY_KEY,
  mutationFn: (api, id) => api.waitlist.notify(id),
});

export const useCancelWaitlistEntry = createMutationHook<string, WaitlistEntry>({
  invalidateKeys: WAITLIST_QUERY_KEY,
  mutationFn: (api, id) => api.waitlist.cancel(id),
});
