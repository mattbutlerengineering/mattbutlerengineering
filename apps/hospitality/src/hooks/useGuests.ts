import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Guest, GuestSegment, UpdateGuestRequest } from "@mbe/types";
import type { FindOrCreateGuestRequest } from "@mbe/api-client";
import { useApiClient } from "./useApiClient.js";

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

export function useGuests(params: UseGuestsParams = {}): UseGuestsResult {
  const { venueId, limit = 50, enabled = true } = params;
  const api = useApiClient();

  const query = useQuery({
    queryKey: [GUESTS_QUERY_KEY, { venueId, limit }],
    queryFn: async () => {
      if (!venueId) return [];
      const response = await api.guests.list({ venueId, limit });
      return response.data;
    },
    enabled: enabled && !!venueId,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

/* ── useGuestSearch ──────────────────────────────────── */

export interface UseGuestSearchParams {
  venueId?: string | null;
  query: string;
  enabled?: boolean;
}

export function useGuestSearch(params: UseGuestSearchParams): UseGuestsResult {
  const { venueId, query, enabled = true } = params;
  const api = useApiClient();

  const searchQuery = useQuery({
    queryKey: [GUESTS_QUERY_KEY, { venueId, search: query }],
    queryFn: async () => {
      if (!venueId || !query) return [];
      const response = await api.guests.search({ venueId, query });
      return response.data;
    },
    enabled: enabled && !!venueId && !!query,
  });

  return {
    data: searchQuery.data,
    isLoading: searchQuery.isLoading,
    error: searchQuery.error ?? null,
    refetch: searchQuery.refetch,
  };
}

/* ── useGuestSegments ────────────────────────────────── */

export interface UseGuestSegmentsResult {
  data: GuestSegment[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useGuestSegments(venueId: string | null | undefined): UseGuestSegmentsResult {
  const api = useApiClient();

  const query = useQuery({
    queryKey: [GUEST_SEGMENTS_QUERY_KEY, venueId],
    queryFn: async () => {
      if (!venueId) return [];
      return api.guests.getSegments(venueId);
    },
    enabled: !!venueId,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
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

export function useUpdateGuest() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ guestId, data }: { guestId: string; data: UpdateGuestRequest }) =>
      api.guests.update(guestId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GUESTS_QUERY_KEY] });
    },
  });
}

/* ── useGuest (single) ───────────────────────────────── */

export interface UseGuestResult {
  data: Guest | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useGuest(guestId: string | null | undefined): UseGuestResult {
  const api = useApiClient();

  const query = useQuery({
    queryKey: [GUESTS_QUERY_KEY, { id: guestId }],
    queryFn: () => api.guests.get(guestId!),
    enabled: !!guestId,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

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
