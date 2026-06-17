import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Guest, GuestSegment, UpdateGuestRequest } from "@mbe/types";
import type { FindOrCreateGuestRequest } from "@mbe/api-client";
import { useApiClient } from "./useApiClient.js";
import {
  useGuests,
  useGuestSearch,
  useGuestSegments,
  GUESTS_QUERY_KEY,
  GUEST_SEGMENTS_QUERY_KEY,
} from "./useGuests.js";

/* ── Types ───────────────────────────────────────────── */

export interface UseGuestDirectoryParams {
  venueId?: string | null;
}

export interface UseGuestDirectoryResult {
  // Data
  guests: Guest[];
  segments: GuestSegment[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchActive: boolean;

  // Selection
  selectedGuestId: string | null;
  selectedGuest: Guest | null;
  selectGuest: (id: string) => void;
  clearSelection: () => void;

  // Mutations
  addGuest: (data: FindOrCreateGuestRequest) => Promise<void>;
  updateGuest: (guestId: string, data: UpdateGuestRequest) => Promise<void>;
  isAddingGuest: boolean;
  isUpdatingGuest: boolean;
}

const DEBOUNCE_MS = 300;

/* ── Hook ────────────────────────────────────────────── */

export function useGuestDirectory({ venueId }: UseGuestDirectoryParams): UseGuestDirectoryResult {
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isSearchActive = debouncedQuery.length > 0;

  // Queries — only one active at a time
  const listResult = useGuests({
    venueId,
    enabled: !isSearchActive,
  });

  const searchResult = useGuestSearch({
    venueId,
    query: debouncedQuery,
    enabled: isSearchActive,
  });

  const { data: segments } = useGuestSegments(venueId);

  const {
    data: guests = [],
    isLoading,
    error,
    refetch,
  } = isSearchActive ? searchResult : listResult;

  // Selection
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);

  const selectedGuest = useMemo(
    () => guests.find((g) => g.id === selectedGuestId) ?? null,
    [guests, selectedGuestId]
  );

  // Mutations
  const addGuestMutation = useMutation({
    mutationFn: (data: FindOrCreateGuestRequest) => api.guests.findOrCreate(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [GUESTS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [GUEST_SEGMENTS_QUERY_KEY, variables.venueId],
      });
    },
  });

  const updateGuestMutation = useMutation({
    mutationFn: ({ guestId, data }: { guestId: string; data: UpdateGuestRequest }) =>
      api.guests.update(guestId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GUESTS_QUERY_KEY] });
    },
  });

  const addGuest = async (data: FindOrCreateGuestRequest): Promise<void> => {
    await addGuestMutation.mutateAsync(data);
  };

  const updateGuest = async (guestId: string, data: UpdateGuestRequest): Promise<void> => {
    await updateGuestMutation.mutateAsync({ guestId, data });
  };

  return {
    guests,
    segments,
    isLoading,
    error,
    refetch,
    searchQuery,
    setSearchQuery,
    isSearchActive,
    selectedGuestId,
    selectedGuest,
    selectGuest: setSelectedGuestId,
    clearSelection: () => setSelectedGuestId(null),
    addGuest,
    updateGuest,
    isAddingGuest: addGuestMutation.isPending,
    isUpdatingGuest: updateGuestMutation.isPending,
  };
}
