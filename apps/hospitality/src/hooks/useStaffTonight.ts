import type { DateRule } from "@mbe/types";
import { useAvailabilityConfig, useAvailabilityDays } from "./useAvailability.js";
import { useNow } from "./useNow.js";
import { useVenueFormat } from "./useVenueFormat.js";
import { currentServiceDate } from "../utils/current-service-date.js";

const NO_RULES: readonly DateRule[] = [];

export interface StaffTonight {
  /** The service day "tonight" means now; `null` until the venue's config has loaded. */
  readonly serviceDate: string | null;
  /** Every date rule of the venue, for the staff surfaces that read Tonight changes. */
  readonly rules: readonly DateRule[];
  /** The service day's waitlist is closed (`bookingOpen.waitlist`); false until known. */
  readonly waitlistClosed: boolean;
}

/**
 * What staff surfaces need to know about tonight, from the config and day summary the app
 * already loads: the service day (not the calendar date, which runs ahead after midnight),
 * the date rules, and whether the waitlist is closed. Failures read as "open", so a failed
 * read never locks staff out: the server is the final guard.
 */
export function useStaffTonight(venueId: string | null | undefined): StaffTonight {
  const { timeZone } = useVenueFormat();
  const now = useNow();
  const config = useAvailabilityConfig({ venueId: venueId ?? null });
  const state = config.data ?? null;
  const serviceDate = state && timeZone ? currentServiceDate(state.config, timeZone, now) : null;
  const days = useAvailabilityDays({
    venueId: venueId ?? null,
    from: serviceDate ?? "",
    to: serviceDate ?? "",
    enabled: serviceDate !== null,
  });
  const summary = days.data?.find((day) => day.serviceDate === serviceDate);
  return {
    serviceDate,
    rules: state?.config.dateRules ?? NO_RULES,
    waitlistClosed: summary ? !summary.bookingOpen.waitlist : false,
  };
}
