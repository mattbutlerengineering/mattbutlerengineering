import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Venue } from "@mbe/types";
import { useVenues, VENUES_QUERY_KEY } from "../hooks/useVenues.js";

interface VenueContextValue {
  venues: readonly Venue[];
  selectedVenueId: string | null;
  selectedVenue: Venue | null;
  setVenueId: (id: string) => void;
  isLoading: boolean;
  isMultiVenue: boolean;
  refetchVenues: () => Promise<void>;
}

export type { VenueContextValue };

const STORAGE_KEY = "mbe-hospitality-venue-id";

function readStoredVenueId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeVenueId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore storage errors */
  }
}

const VenueContext = createContext<VenueContextValue | null>(null);

interface VenueProviderProps {
  readonly children: ReactNode;
}

export function VenueProvider({ children }: VenueProviderProps) {
  const queryClient = useQueryClient();

  // Venues are owned by the shared react-query hook — no bespoke effect,
  // fetchVersionRef, or manual loading state. SSE venue mutations and the
  // useUpdateVenue mutation both invalidate VENUES_QUERY_KEY, so this list
  // stays fresh without any imperative refetch plumbing here.
  const { data: fetchedVenues, isLoading } = useVenues({ limit: 100 });
  const venues = useMemo<readonly Venue[]>(() => fetchedVenues ?? [], [fetchedVenues]);

  // The explicitly-chosen venue id: seeded from storage and updated by
  // setVenueId. It may reference a venue that no longer exists (or be null
  // before any choice is made), so the *effective* selection is reconciled
  // synchronously below rather than in a post-render effect.
  const [chosenVenueId, setChosenVenueId] = useState<string | null>(readStoredVenueId);

  // Reconcile the selection during render so the readiness check never observes
  // a null selection on the same commit that venues resolve (#3314): keep the
  // chosen id if it still exists, else fall back to the first venue, else null
  // while the list is empty/loading.
  const selectedVenueId = useMemo<string | null>(() => {
    if (chosenVenueId && venues.some((v) => v.id === chosenVenueId)) {
      return chosenVenueId;
    }
    return venues[0]?.id ?? null;
  }, [chosenVenueId, venues]);

  // Persist the reconciled selection (e.g. the first-venue fallback) so a reload
  // restores it. Runs only when it actually differs from what's stored.
  useEffect(() => {
    if (selectedVenueId && selectedVenueId !== readStoredVenueId()) {
      storeVenueId(selectedVenueId);
    }
  }, [selectedVenueId]);

  const setVenueId = useCallback(
    (id: string) => {
      const exists = venues.some((v) => v.id === id);
      if (!exists) return;
      setChosenVenueId(id);
      storeVenueId(id);
    },
    [venues]
  );

  const refetchVenues = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: [VENUES_QUERY_KEY] });
  }, [queryClient]);

  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === selectedVenueId) ?? null,
    [venues, selectedVenueId]
  );

  const isMultiVenue = venues.length > 1;

  const value = useMemo<VenueContextValue>(
    () => ({
      venues,
      selectedVenueId,
      selectedVenue,
      setVenueId,
      isLoading,
      isMultiVenue,
      refetchVenues,
    }),
    [venues, selectedVenueId, selectedVenue, setVenueId, isLoading, isMultiVenue, refetchVenues]
  );

  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>;
}

export function useVenue(): VenueContextValue {
  const context = useContext(VenueContext);
  if (!context) {
    throw new Error("useVenue must be used within a VenueProvider");
  }
  return context;
}
