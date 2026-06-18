import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Guest, GuestSegment, UpdateGuestRequest } from "@mbe/types";
import type { FindOrCreateGuestRequest } from "@mbe/api-client";
import { useApiClient } from "./useApiClient.js";
import { createQueryHook, type QueryHookResult } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";

export const GUESTS_QUERY_KEY = "guests" as const;
export const GUEST_SEGMENTS_QUERY_KEY = "guestSegments" as const;

/* ── useGuests ───────────────────────────────────────── */

export interface UseGuestsParams {
  venueId?: string | null;
  limit?: number;
  enabled?: boolean;
}

export interface UseGuestsResult {
  data: Guest[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export const useGuests = createQueryHook<Guest[], UseGuestsParams>({
  key: GUESTS_QUERY_KEY,
  fetcher: async (params, api) => {
    if (!params?.venueId) return [];
    const response = await api.guests.list({ venueId: params.venueId, limit: params.limit ?? 50 });
    return response.data;
  },
  getEnabled: (params) => !!params?.venueId,
});

/* ── useGuestSearch ──────────────────────────────────── */

export interface UseGuestSearchParams {
  venueId?: string | null;
  query: string;
  enabled?: boolean;
}

const useGuestSearchQuery = createQueryHook<Guest[], UseGuestSearchParams>({
  key: GUESTS_QUERY_KEY,
  fetcher: async (params, api) => {
    if (!params?.venueId || !params.query) return [];
    const response = await api.guests.search({ venueId: params.venueId, query: params.query });
    return response.data;
  },
  getEnabled: (params) => !!params?.venueId && !!params?.query,
});

export function useGuestSearch(params: UseGuestSearchParams): UseGuestsResult {
  return useGuestSearchQuery(params);
}

/* ── useGuestSegments ────────────────────────────────── */

export interface UseGuestSegmentsResult {
  data: GuestSegment[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

const useGuestSegmentsQuery = createQueryHook<
  GuestSegment[],
  { venueId: string | null | undefined }
>({
  key: GUEST_SEGMENTS_QUERY_KEY,
  fetcher: async (params, api) => {
    if (!params?.venueId) return [];
    return api.guests.getSegments(params.venueId);
  },
  getEnabled: (params) => !!params?.venueId,
});

export function useGuestSegments(venueId: string | null | undefined): UseGuestSegmentsResult {
  return useGuestSegmentsQuery({ venueId }) as QueryHookResult<GuestSegment[]>;
}

/* ── useGuest (single) ───────────────────────────────── */

export interface UseGuestResult {
  data: Guest | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const useGuestQuery = createQueryHook<Guest, { id: string | null | undefined }>({
  key: GUESTS_QUERY_KEY,
  fetcher: (params, api) => api.guests.get(params!.id!),
  getEnabled: (params) => !!params?.id,
});

export function useGuest(guestId: string | null | undefined): UseGuestResult {
  return useGuestQuery({ id: guestId });
}

/* ── useAddGuest mutation ────────────────────────────── */

export function useAddGuest() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: FindOrCreateGuestRequest) => api.guests.findOrCreate(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [GUESTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [GUEST_SEGMENTS_QUERY_KEY, variables.venueId] });
    },
  });
}

/* ── useUpdateGuest mutation ─────────────────────────── */

export const useUpdateGuest = createMutationHook<{ guestId: string; data: UpdateGuestRequest }>({
  invalidateKey: GUESTS_QUERY_KEY,
  mutationFn: (api, { guestId, data }) => api.guests.update(guestId, data),
});

/* ── useAddStaffNote mutation ────────────────────────── */

export function useAddStaffNote() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ guestId, text }: { guestId: string; text: string }) =>
      api.guests.addNote(guestId, text),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [GUESTS_QUERY_KEY, { id: variables.guestId }] });
      queryClient.invalidateQueries({ queryKey: [GUESTS_QUERY_KEY] });
    },
  });
}
