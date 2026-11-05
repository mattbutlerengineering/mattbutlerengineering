import { UNSET_LARGEST_PARTY } from "../availability/booking-rules.js";

/**
 * What the service applies when the Settings step leaves a field blank. A blank advance window
 * has none: guests can book any date ahead (slot-rules.ts `bookingWindow`). The step's hints and
 * the Launch review's "(default)" values both read these.
 */
export const SETTINGS_DEFAULTS = {
  defaultReservationDuration: 90,
  maxPartySize: UNSET_LARGEST_PARTY,
} as const;
