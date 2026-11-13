import type { ServiceHoursContext } from "../service-hours.js";

/**
 * What the hub's wording functions are handed: the caller's `t` and the venue's formats. The
 * wording modules import neither React nor the catalog; the components that call them do.
 */
export type HubTextContext = ServiceHoursContext;

/** "Dec 24": a date inside a row's line or its marker. */
export function shortDate(date: string, { format }: HubTextContext): string {
  return format.formatCalendarDate(date, { month: "short", day: "numeric" });
}
