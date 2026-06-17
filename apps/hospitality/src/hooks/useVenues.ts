import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Venue, UpdateVenueRequest } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";
import { createQueryHook, type QueryHookResult } from "./create-query-hook.js";

export const VENUES_QUERY_KEY = "venues" as const;
export const VENUE_BY_SLUG_QUERY_KEY = "venueBySlug" as const;

/* ── useVenues ───────────────────────────────────────── */

export interface UseVenuesParams {
  limit?: number;
  enabled?: boolean;
}

export interface UseVenuesResult {
  data: Venue[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export const useVenues = createQueryHook<Venue[], UseVenuesParams>({
  key: VENUES_QUERY_KEY,
  fetcher: async (params, api) => {
    const response = await api.venues.list({ limit: params?.limit ?? 50 });
    return response.data;
  },
});

/* ── useUpdateVenue mutation ─────────────────────────── */

export function useUpdateVenue() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ venueId, data }: { venueId: string; data: UpdateVenueRequest }) =>
      api.venues.update(venueId, data),
    onSuccess: (_updatedVenue) => {
      queryClient.invalidateQueries({ queryKey: [VENUES_QUERY_KEY] });
    },
  });
}

/* ── useVenueBySlug ──────────────────────────────────── */

export interface UseVenueBySlugResult {
  data: Venue | null | undefined;
  isLoading: boolean;
  error: Error | null;
}

const useVenueBySlugQuery = createQueryHook<Venue | null, { slug: string | undefined }>({
  key: VENUE_BY_SLUG_QUERY_KEY,
  fetcher: async (params, api) => {
    if (!params?.slug) return null;
    return api.venues.getBySlug(params.slug);
  },
  getEnabled: (params) => !!params?.slug,
  select: (data) => data ?? null,
});

export function useVenueBySlug(slug: string | undefined): UseVenueBySlugResult {
  return useVenueBySlugQuery({ slug }) as QueryHookResult<Venue | null>;
}
