import { useEffect, useState } from "react";
import type { CreateReservationRequest, Reservation } from "@mbe/types";
import type { ListReservationsParams } from "@mbe/api-client";
import { createQueryHook } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";
import { getCachedReservations, setCachedReservations } from "../lib/offline-cache.js";

export const RESERVATIONS_QUERY_KEY = "reservations" as const;

export interface UseReservationsParams extends ListReservationsParams {
  enabled?: boolean;
}

export interface UseReservationsResult {
  data: Reservation[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /** True when `data` was served from the offline cache after a fetch failure. */
  isFromCache: boolean;
  /**
   * Epoch ms `data` was last confirmed synced with the server — the moment
   * it was written to the offline cache, whether that write just happened
   * (fresh fetch) or happened in the past (the entry now being served as
   * `isFromCache` fallback). `undefined` until a successful fetch or cache
   * read has resolved for the current `(venueId, date)`.
   */
  lastSyncedAt: number | undefined;
}

const useReservationsQuery = createQueryHook<Reservation[], UseReservationsParams>({
  key: RESERVATIONS_QUERY_KEY,
  fetcher: async (params, api) => {
    const response = await api.reservations.list(params ?? {});
    return response.data;
  },
});

/** The `(venueId, date)` a cache entry was fetched/written for — see
 * `cachedFallback`/`lastWrite` below. */
interface KeyedCacheEntry {
  key: string;
  reservations: Reservation[];
  cachedAt: number;
}

function fallbackKey(venueId: string, date: string): string {
  return `${venueId}::${date}`;
}

/**
 * Wraps the raw query hook with the offline-cache read/write side of the
 * hospitality offline-first shell: successful fetches are cached under
 * `venueId`/`date`, and a failed fetch falls back to whatever was last
 * cached for that key instead of surfacing the raw error.
 */
export function useReservations(
  params?: (UseReservationsParams & { enabled?: boolean }) | undefined
): UseReservationsResult {
  const query = useReservationsQuery(params);
  const venueId = params?.venueId;
  const date = params?.date;
  const currentKey =
    venueId !== undefined && date !== undefined ? fallbackKey(venueId, date) : undefined;

  const [cachedFallback, setCachedFallback] = useState<KeyedCacheEntry | undefined>(undefined);
  const [lastWrite, setLastWrite] = useState<KeyedCacheEntry | undefined>(undefined);

  useEffect(() => {
    if (query.data === undefined || venueId === undefined || date === undefined) return;
    const key = fallbackKey(venueId, date);
    const cachedAt = Date.now();
    setLastWrite({ key, reservations: query.data, cachedAt });
    // Best-effort write — a cache failure (e.g. IndexedDB unavailable) must
    // never block rendering the freshly-fetched data.
    void setCachedReservations(venueId, date, query.data).catch(() => undefined);
  }, [query.data, venueId, date]);

  useEffect(() => {
    if (query.error === null || venueId === undefined || date === undefined) return;
    let cancelled = false;
    const key = fallbackKey(venueId, date);
    getCachedReservations(venueId, date)
      .then((cached) => {
        if (cancelled) return;
        setCachedFallback(
          cached !== null
            ? { key, reservations: cached.reservations, cachedAt: cached.cachedAt }
            : undefined
        );
      })
      // Best-effort read — leave the original fetch error surfaced as-is.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [query.error, venueId, date]);

  // Render-time guard: `cachedFallback`/`lastWrite` can lag behind
  // `(venueId, date)` switching faster than the async cache lookup above
  // resolves (or simply holding the previous key's value while today's
  // hasn't fetched yet). Requiring the stored key to match the current one —
  // rather than resetting the state in an effect — makes a stale-key render
  // unrepresentable regardless of how the two race.
  const fallbackEntry =
    cachedFallback !== undefined && cachedFallback.key === currentKey ? cachedFallback : undefined;
  const freshEntry =
    lastWrite !== undefined && lastWrite.key === currentKey ? lastWrite : undefined;

  if (query.error !== null && fallbackEntry !== undefined) {
    return {
      data: fallbackEntry.reservations,
      isLoading: false,
      error: null,
      refetch: query.refetch,
      isFromCache: true,
      lastSyncedAt: fallbackEntry.cachedAt,
    };
  }

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isFromCache: false,
    lastSyncedAt: freshEntry?.cachedAt,
  };
}

/* ── useCreateReservation mutation ───────────────────── */

export const useCreateReservation = createMutationHook<CreateReservationRequest, Reservation>({
  invalidateKeys: RESERVATIONS_QUERY_KEY,
  mutationFn: (api, data) => api.reservations.create(data),
});
