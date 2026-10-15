import { createContext, useContext } from "react";
import type { VenueContextValue } from "./VenueContext.js";

/** The context object lives apart from `VenueProvider` so leaf formatting hooks can read it. */
export const VenueContext = createContext<VenueContextValue | null>(null);

/**
 * Like `useVenue`, but returns `null` outside a `VenueProvider`. For leaf display
 * components (formatting) that must render in isolation and before venues load.
 */
export function useOptionalVenue(): VenueContextValue | null {
  return useContext(VenueContext);
}
