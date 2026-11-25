import { useAvailabilityConfig } from "./useAvailability.js";
import { useNow } from "./useNow.js";
import { useVenueFormat } from "./useVenueFormat.js";
import { lastServiceDate } from "../utils/last-service-date.js";

export interface LastServiceDate {
  /** The service day that last opened; `null` until the venue's config has loaded (or failed). */
  readonly date: string | null;
  /** `error` only when there is no config to compute from. */
  readonly status: "loading" | "ready" | "error";
}

/** The day "how did the night go" means right now, from the venue's own hours and clock. */
export function useLastServiceDate(venueId: string | null | undefined): LastServiceDate {
  const { timeZone } = useVenueFormat();
  const now = useNow();
  const config = useAvailabilityConfig({ venueId: venueId ?? null });
  const state = config.data ?? null;
  if (state && timeZone) {
    return { date: lastServiceDate(state.config, timeZone, now), status: "ready" };
  }
  return { date: null, status: !state && config.error ? "error" : "loading" };
}
