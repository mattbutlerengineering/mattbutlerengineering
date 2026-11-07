import { z } from "zod";

/** The Availability page's tabs, as `?tab=` names them. */
export const AVAILABILITY_TABS = ["calendar", "special", "schedules"] as const;
export type AvailabilityTab = (typeof AVAILABILITY_TABS)[number];

/**
 * How another page opens `/availability` (architecture.md "Availability entry contract"): the tab to
 * start on, a section whose Close dialog to open, and whether it came from Venue Setup.
 */
export interface AvailabilityEntry {
  readonly tab?: AvailabilityTab;
  readonly closeSection?: string;
  readonly from?: "setup";
}

const ROUTE = "/availability";

// Each field is parsed on its own: a bad value drops that field, never the others.
const FIELDS = {
  tab: z.enum(AVAILABILITY_TABS),
  closeSection: z.string().min(1),
  from: z.literal("setup"),
} as const;

/** The valid entry in a query string; anything invalid or unknown is ignored, never an error. */
export function parseAvailabilityEntry(search: string | URLSearchParams): AvailabilityEntry {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const entry: { -readonly [K in keyof AvailabilityEntry]: AvailabilityEntry[K] } = {};
  const tab = FIELDS.tab.safeParse(params.get("tab"));
  if (tab.success) entry.tab = tab.data;
  const closeSection = FIELDS.closeSection.safeParse(params.get("closeSection"));
  if (closeSection.success) entry.closeSection = closeSection.data;
  const from = FIELDS.from.safeParse(params.get("from"));
  if (from.success) entry.from = from.data;
  return entry;
}

/** The `/availability` path for an entry, so no caller hand-writes a query string. */
export function availabilityPath(entry: AvailabilityEntry): string {
  const params = new URLSearchParams();
  if (entry.tab) params.set("tab", entry.tab);
  if (entry.closeSection) params.set("closeSection", entry.closeSection);
  if (entry.from) params.set("from", entry.from);
  const query = params.toString();
  return query ? `${ROUTE}?${query}` : ROUTE;
}
