import { createContext, useContext } from "react";
import type { Venue } from "@mbe/types";

export interface VenueContextValue {
  venues: readonly Venue[];
  selectedVenueId: string | null;
  selectedVenue: Venue | null;
  setVenueId: (id: string) => void;
  isLoading: boolean;
  /** Set when the venues fetch failed — distinct from an operator who genuinely has no venues. */
  venuesError: Error | null;
  isMultiVenue: boolean;
  refetchVenues: () => Promise<void>;
}

/** The context object lives apart from `VenueProvider` so leaf formatting hooks can read it. */
export const VenueContext = createContext<VenueContextValue | null>(null);

/**
 * Like `useVenue`, but returns `null` outside a `VenueProvider`. For leaf display
 * components (formatting) that must render in isolation and before venues load.
 */
export function useOptionalVenue(): VenueContextValue | null {
  return useContext(VenueContext);
}
