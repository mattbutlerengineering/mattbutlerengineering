import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Venue, UpdateVenueRequest } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";

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

export function useVenues(params: UseVenuesParams = {}): UseVenuesResult {
  const { limit = 50, enabled = true } = params;
  const api = useApiClient();

  const query = useQuery({
    queryKey: [VENUES_QUERY_KEY, { limit }],
    queryFn: async () => {
      const response = await api.venues.list({ limit });
      return response.data;
    },
    enabled,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

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

export function useVenueBySlug(slug: string | undefined): UseVenueBySlugResult {
  const api = useApiClient();

  const query = useQuery({
    queryKey: [VENUE_BY_SLUG_QUERY_KEY, slug],
    queryFn: async () => {
      if (!slug) return null;
      return api.venues.getBySlug(slug);
    },
    enabled: !!slug,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
