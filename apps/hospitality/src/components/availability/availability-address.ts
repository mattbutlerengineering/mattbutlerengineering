/**
 * The only place an Availability address is built or read (availability-hub architecture.md
 * "Address module"). Callers name a target; this module decides the address.
 *
 * The hub is the index, and booking rules is a drawer over it at `booking-rules`. Until the item
 * that builds any other view lands, its target resolves to the tab of today's page that does the
 * same job, so no link leads to a missing view. Today's page is mounted at `calendar`.
 * The item that builds a view gives its target its own path in `availabilityPath`; old addresses
 * follow by themselves, because `legacyRedirect` builds its answer with `availabilityPath`.
 */

const ROUTE = "/availability";
/** Where today's page is mounted until the calendar page replaces it (breakdown D5.3). */
const TODAYS_PAGE = `${ROUTE}/calendar`;

/**
 * Whether a pathname is today's page, which mounts its own blocked-undo dialog until D5.3.
 * In any case, as the router matches it.
 */
export const isTodaysPage = (pathname: string): boolean =>
  pathname.replace(/\/+$/, "").toLowerCase() === TODAYS_PAGE;

/** What the Close dialog opens on, as `?close=` names it. */
export type CloseTarget =
  | { readonly kind: "tonight" }
  | { readonly kind: "date"; readonly date: string }
  | { readonly kind: "range"; readonly from: string; readonly to: string }
  | { readonly kind: "dates"; readonly dates: readonly string[] }
  | { readonly kind: "section"; readonly sectionId: string };

type AvailabilityView =
  | { readonly view: "hub" }
  | { readonly view: "hours"; readonly service?: string }
  | { readonly view: "seasonal"; readonly screen?: "new" | "compare" }
  | { readonly view: "seasonal"; readonly screen: "edit"; readonly scheduleId: string }
  | { readonly view: "specialDates" }
  | { readonly view: "closures" }
  | {
      readonly view: "calendar";
      readonly calendarView?: "month" | "week";
      readonly date?: string;
    }
  | { readonly view: "bookingRules" }
  | { readonly view: "history" };

/** A view, plus the dialog to open over it and whether the visit came from Venue Setup. */
export type AvailabilityTarget = AvailabilityView & {
  readonly close?: CloseTarget;
  readonly pause?: boolean;
  readonly from?: "setup";
};

/** The tabs of today's page, as `?tab=` names them. */
export const AVAILABILITY_TABS = ["calendar", "special", "schedules"] as const;
export type AvailabilityTab = (typeof AVAILABILITY_TABS)[number];

/** How today's page is opened: the search params it reads on mount. */
export interface AvailabilityEntry {
  readonly tab?: AvailabilityTab;
  readonly closeSection?: string;
  /** Opens the schedule editor on Schedules, seeded from the regular week (Add a schedule…). */
  readonly action?: "addSchedule";
  readonly from?: "setup";
}

// Checked by hand, not with a schema library: the sidebar imports this module, so it loads with
// the app shell.
const isTab = (value: string | null): value is AvailabilityTab =>
  AVAILABILITY_TABS.some((tab) => tab === value);

/**
 * The valid entry in a query string; anything invalid or unknown is ignored, never an error.
 * Each field is parsed on its own: a bad value drops that field, never the others.
 */
export function parseAvailabilityEntry(search: string | URLSearchParams): AvailabilityEntry {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const tab = params.get("tab");
  const closeSection = params.get("closeSection");
  return {
    ...(isTab(tab) && { tab }),
    ...(closeSection && { closeSection }),
    ...(params.get("action") === "addSchedule" && { action: "addSchedule" as const }),
    ...(params.get("from") === "setup" && { from: "setup" as const }),
  };
}

/**
 * The tab of today's page that does a view's job; none for the views it lands on by itself, and
 * none for booking rules, which has its own path.
 */
const PAGE_TAB: Readonly<Record<AvailabilityView["view"], AvailabilityTab | undefined>> = {
  hub: undefined,
  hours: "schedules",
  seasonal: "schedules",
  specialDates: "special",
  closures: "special",
  calendar: "calendar",
  bookingRules: undefined,
  history: undefined,
};

/** The booking rules drawer, over the hub. */
const BOOKING_RULES = `${ROUTE}/booking-rules`;

/** Whether a pathname is the booking rules drawer. In any case, as the router matches it. */
export const isBookingRulesPage = (pathname: string): boolean =>
  pathname.replace(/\/+$/, "").toLowerCase() === BOOKING_RULES;

const withSearch = (path: string, params: URLSearchParams): string => {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

/**
 * The address for a target, so no caller hand-writes a path or a query string.
 *
 * Today's page opens only a section's Close dialog from its address, so any other close target,
 * the Pause dialog, and a named service, schedule, calendar view or date are dropped until the
 * view that reads them lands.
 */
export function availabilityPath(target: AvailabilityTarget): string {
  const params = new URLSearchParams();
  // The hub opens no dialog yet (C2.4), so a section's Close dialog still opens on today's page.
  if (target.view === "hub" && target.close?.kind !== "section") {
    if (target.from) params.set("from", target.from);
    return withSearch(ROUTE, params);
  }
  // The drawer sits over the hub, which opens no dialog yet (C2.4): a close target is dropped.
  if (target.view === "bookingRules") {
    if (target.from) params.set("from", target.from);
    return withSearch(BOOKING_RULES, params);
  }
  const tab = PAGE_TAB[target.view];
  if (tab) params.set("tab", tab);
  if (target.close?.kind === "section") params.set("closeSection", target.close.sectionId);
  if (target.view === "seasonal" && target.screen === "new") params.set("action", "addSchedule");
  if (target.from) params.set("from", target.from);
  return withSearch(TODAYS_PAGE, params);
}

const MAX_CLOSE_DATES = 20;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

const isDate = (value: string): boolean => {
  if (!DATE_SHAPE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  // A day past the month's end parses and rolls over, so the date must read back unchanged.
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
};

const SECTION_PREFIX = "section:";
const DATES_PREFIX = "dates:";
const RANGE_SEPARATOR = "..";

function parseCloseTarget(value: string | null): CloseTarget | null {
  if (!value) return null;
  if (value === "tonight") return { kind: "tonight" };
  if (isDate(value)) return { kind: "date", date: value };
  if (value.startsWith(SECTION_PREFIX)) {
    const sectionId = value.slice(SECTION_PREFIX.length);
    return sectionId ? { kind: "section", sectionId } : null;
  }
  if (value.startsWith(DATES_PREFIX)) {
    const dates = value.slice(DATES_PREFIX.length).split(",");
    return dates.length <= MAX_CLOSE_DATES && dates.every(isDate) ? { kind: "dates", dates } : null;
  }
  const [from, to, ...rest] = value.split(RANGE_SEPARATOR);
  if (from === undefined || to === undefined || rest.length > 0) return null;
  // Dates in this shape sort as text.
  return isDate(from) && isDate(to) && from <= to ? { kind: "range", from, to } : null;
}

/** What an address asks for beyond its view: a dialog to open, and the Venue Setup back link. */
export interface AvailabilityAddress {
  /** `null` when there is no close target, or it does not parse: no dialog. */
  readonly close: CloseTarget | null;
  readonly pause: boolean;
  readonly from: "setup" | null;
}

/** Reads `?close=`, `?pause=1` and `?from=setup`. A field that does not parse is dropped, never an error. */
export function readAvailabilityAddress(location: {
  readonly search: string;
}): AvailabilityAddress {
  const params = new URLSearchParams(location.search);
  return {
    close: parseCloseTarget(params.get("close")),
    pause: params.get("pause") === "1",
    from: params.get("from") === "setup" ? "setup" : null,
  };
}

/** architecture.md "Old addresses": the view each tab of today's page became. */
const TAB_VIEW: Readonly<Record<AvailabilityTab, AvailabilityView>> = {
  schedules: { view: "hours" },
  calendar: { view: "calendar" },
  special: { view: "specialDates" },
};

/**
 * Where a search on the bare route that holds an old param (`?tab=`, `?action=addSchedule`,
 * `?closeSection=`) goes, with `from=setup` carried; `null` when it holds none.
 *
 * Each old param names a view (architecture.md "Old addresses"), and the answer is wherever
 * `availabilityPath` puts that view today. So it never names a route that is not mounted, and a
 * row reaches its final address in the same change that gives its view a path of its own.
 */
export function legacyRedirect(search: string): string | null {
  const entry = parseAvailabilityEntry(search);
  if (!entry.tab && !entry.action && !entry.closeSection) return null;
  const view: AvailabilityView = entry.action
    ? { view: "seasonal", screen: "new" }
    : entry.tab
      ? TAB_VIEW[entry.tab]
      : { view: "hub" };
  return availabilityPath({
    ...view,
    ...(entry.closeSection && {
      close: { kind: "section" as const, sectionId: entry.closeSection },
    }),
    ...(entry.from && { from: entry.from }),
  });
}
