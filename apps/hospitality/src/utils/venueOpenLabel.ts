import { formatLocalTime } from "./format.js";
import type { VenueOpenState, Weekday } from "./venueOpenState.js";

/** Capitalised en-US weekday names, as `formatLongDate` prints them. */
export const WEEKDAY_LABEL: Readonly<Record<Weekday, string>> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** Same phrase as LaunchStep and TimeSlotPicker use for missing hours. */
const UNSET_LABEL = "No operating hours set";

/**
 * The neon sign's caption and accessible name — one string per state, in the
 * app's 12-hour convention. Commas rather than middle dots, so a screen
 * reader pauses instead of announcing punctuation.
 */
export function formatVenueOpenLabel(s: VenueOpenState): string {
  switch (s.state) {
    case "open":
      return `Open until ${formatLocalTime(s.closesAt)}`;
    case "opening-soon":
      return `Opens at ${formatLocalTime(s.opensAt)}`;
    case "closed":
      return s.opensOn === null
        ? `Closed, opens at ${formatLocalTime(s.opensAt)}`
        : `Closed, opens ${WEEKDAY_LABEL[s.opensOn]} at ${formatLocalTime(s.opensAt)}`;
    case "unset":
      return UNSET_LABEL;
  }
}
