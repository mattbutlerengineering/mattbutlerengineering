import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Guest, GuestSegment, UpdateGuestRequest } from "@mbe/types";
import type { FindOrCreateGuestRequest } from "@mbe/api-client";
import { useApiClient } from "./useApiClient.js";
import {
  useGuest,
  useGuests,
  useGuestSearch,
  useGuestSegments,
  GUESTS_QUERY_KEY,
  guestSegmentsQueryKey,
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

  // Pagination (list mode only — search returns one capped page)
  /** The API's total for the current list or search, not the number of visible rows. */
  totalCount: number;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;

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
  const [searchQuery, setSearchQueryState] = useState("");
  const [page, setPage] = useState(1);

  const setSearchQuery = (query: string) => {
    setSearchQueryState(query);
    setPage(1);
  };
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
    page,
    enabled: !isSearchActive,
  });

  const searchResult = useGuestSearch({
    venueId,
    query: debouncedQuery,
    enabled: isSearchActive,
  });

  const { data: segments } = useGuestSegments(venueId);

  const { data: guestPage, isLoading, error, refetch } = isSearchActive ? searchResult : listResult;
  const guests = useMemo(() => guestPage?.data ?? [], [guestPage]);
  const totalCount = guestPage?.pagination.total ?? guests.length;
  const totalPages = guestPage?.pagination.totalPages ?? 1;

  // Selection is independent of the visible rows: a guest that a search or page
  // change drops from view is fetched by id instead of leaving the drawer empty.
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const visibleGuest = guests.find((g) => g.id === selectedGuestId) ?? null;
  const { data: fetchedGuest } = useGuest(visibleGuest ? null : selectedGuestId);
  const selectedGuest = visibleGuest ?? (selectedGuestId ? (fetchedGuest ?? null) : null);

  // Mutations
  const addGuestMutation = useMutation({
    mutationFn: (data: FindOrCreateGuestRequest) => api.guests.findOrCreate(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [GUESTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: guestSegmentsQueryKey(variables.venueId) });
    },
  });

  const updateGuestMutation = useMutation({
    mutationFn: ({ guestId, data }: { guestId: string; data: UpdateGuestRequest }) =>
      api.guests.update(guestId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GUESTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: guestSegmentsQueryKey(venueId) });
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
    totalCount,
    page,
    totalPages,
    setPage,
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
