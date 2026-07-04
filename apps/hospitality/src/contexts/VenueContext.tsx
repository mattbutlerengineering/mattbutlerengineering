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

  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(readStoredVenueId);

  // Once venues resolve, reconcile the selection: keep the stored id if it
  // still exists, else fall back to the first venue (persisting that choice),
  // else clear. Re-runs only when the venue set actually changes.
  useEffect(() => {
    if (isLoading) return;
    const list = fetchedVenues ?? [];
    const storedId = readStoredVenueId();
    const nextId = list.some((v) => v.id === storedId)
      ? storedId
      : list.length > 0
        ? list[0].id
        : null;
    if (nextId && nextId !== storedId) {
      storeVenueId(nextId);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedVenueId(nextId);
  }, [fetchedVenues, isLoading]);

  const setVenueId = useCallback(
    (id: string) => {
      const exists = venues.some((v) => v.id === id);
      if (!exists) return;
      setSelectedVenueId(id);
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
