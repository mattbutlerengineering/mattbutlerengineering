import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { createApiClient } from "@mbe/api-client";
import { useAuth } from "@mbe/auth/react";
import type { Venue } from "@mbe/types";

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
  const { accessToken } = useAuth();

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  const [venues, setVenues] = useState<readonly Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(
    readStoredVenueId
  );
  const [isLoading, setIsLoading] = useState(true);
  const fetchVersionRef = useRef(0);

  const fetchVenuesInner = useCallback(async () => {
    const version = ++fetchVersionRef.current;
    setIsLoading(true);
    try {
      const response = await api.venues.list({ limit: 100 });
      if (version !== fetchVersionRef.current) return;

      const fetched: readonly Venue[] = response.data;
      setVenues(fetched);

      // Auto-select logic: use stored ID if it matches a fetched venue,
      // otherwise fall back to the first venue
      const storedId = readStoredVenueId();
      const storedExists = fetched.some((v) => v.id === storedId);

      if (storedExists) {
        setSelectedVenueId(storedId);
      } else if (fetched.length > 0) {
        const firstId = fetched[0].id;
        setSelectedVenueId(firstId);
        storeVenueId(firstId);
      } else {
        setSelectedVenueId(null);
      }
    } catch {
      if (version === fetchVersionRef.current) {
        setVenues([]);
        setSelectedVenueId(null);
      }
    } finally {
      if (version === fetchVersionRef.current) {
        setIsLoading(false);
      }
    }
  }, [api]);

  // Fetch venues on mount
  useEffect(() => {
    fetchVenuesInner();
  }, [fetchVenuesInner]);

  const setVenueId = useCallback(
    (id: string) => {
      const exists = venues.some((v) => v.id === id);
      if (!exists) return;
      setSelectedVenueId(id);
      storeVenueId(id);
    },
    [venues]
  );

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
      refetchVenues: fetchVenuesInner,
    }),
    [venues, selectedVenueId, selectedVenue, setVenueId, isLoading, isMultiVenue, fetchVenuesInner]
  );

  return (
    <VenueContext.Provider value={value}>{children}</VenueContext.Provider>
  );
}

export function useVenue(): VenueContextValue {
  const context = useContext(VenueContext);
  if (!context) {
    throw new Error("useVenue must be used within a VenueProvider");
  }
  return context;
}
