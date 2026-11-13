/**
 * The only place an Availability address is built or read (availability-hub architecture.md
 * "Address module"). Callers name a target; this module decides the address.
 *
 * The hub is the index; booking rules and History are drawers over it at `booking-rules` and
 * `history`, and regular hours is a page of its own at `hours`. Until the item
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

/**
 * What the Close dialog opens on, as `?close=` names it. `venue` opens it on the whole venue with
 * the date still to be asked (the hub's "Close the venue or part of it").
 */
export type CloseTarget =
  | { readonly kind: "venue" }
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

/**
 * How today's page is opened: the search params it reads on mount. `closeSection` is an old
 * address only, read by `legacyRedirect`; no address is built with it.
 */
export interface AvailabilityEntry {
  readonly tab?: AvailabilityTab;
  readonly closeSection?: string;
  /** Opens the schedule editor on Schedules, seeded from the regular week (Add a schedule…). */
  readonly action?: "addSchedule";
  /** Opens that day's drawer on the calendar (`YYYY-MM-DD`, a real day). */
  readonly date?: string;
  readonly from?: "setup";
}

// Checked by hand, not with a schema library: the sidebar imports this module, so it loads with
// the app shell.
const isTab = (value: string | null): value is AvailabilityTab =>
  AVAILABILITY_TABS.some((tab) => tab === value);

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

const isDate = (value: string): boolean => {
  if (!DATE_SHAPE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  // A day past the month's end parses and rolls over, so the date must read back unchanged.
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
};

/**
 * The valid entry in a query string; anything invalid or unknown is ignored, never an error.
 * Each field is parsed on its own: a bad value drops that field, never the others.
 */
export function parseAvailabilityEntry(search: string | URLSearchParams): AvailabilityEntry {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const tab = params.get("tab");
  const closeSection = params.get("closeSection");
  const date = params.get("date");
  return {
    ...(isTab(tab) && { tab }),
    ...(closeSection && { closeSection }),
    ...(params.get("action") === "addSchedule" && { action: "addSchedule" as const }),
    ...(date !== null && isDate(date) && { date }),
    ...(params.get("from") === "setup" && { from: "setup" as const }),
  };
}

/**
 * The tab of today's page that does a view's job; none for the views it lands on by itself, and
 * none for booking rules and History, which have their own paths.
 */
const PAGE_TAB: Readonly<Record<AvailabilityView["view"], AvailabilityTab | undefined>> = {
  hub: undefined,
  hours: undefined,
  seasonal: "schedules",
  specialDates: "special",
  closures: "special",
  calendar: "calendar",
  bookingRules: undefined,
  history: undefined,
};

/** The booking rules drawer, over the hub. */
const BOOKING_RULES = `${ROUTE}/booking-rules`;
/** Regular hours, a page of its own (`?service=` names the service to open). */
const HOURS = `${ROUTE}/hours`;

/** The service `?service=` names on regular hours, or `null`. */
export const readHoursService = (location: { readonly search: string }): string | null =>
  new URLSearchParams(location.search).get("service") || null;

/** Whether a pathname is the booking rules drawer. In any case, as the router matches it. */
export const isBookingRulesPage = (pathname: string): boolean =>
  pathname.replace(/\/+$/, "").toLowerCase() === BOOKING_RULES;

/** The History drawer, over the hub. */
const HISTORY = `${ROUTE}/history`;

/** Whether a pathname is the History drawer. In any case, as the router matches it. */
export const isHistoryPage = (pathname: string): boolean =>
  pathname.replace(/\/+$/, "").toLowerCase() === HISTORY;

/** The views with a path of their own: the hub, the drawers over it and regular hours. */
const OWN_PATHS: Readonly<Partial<Record<AvailabilityView["view"], string>>> = {
  hub: ROUTE,
  hours: HOURS,
  bookingRules: BOOKING_RULES,
  history: HISTORY,
};

// `:` and `,` are legal in a query, so the close target stays readable in the address bar.
const queryOf = (params: URLSearchParams): string =>
  params.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",");

const withSearch = (path: string, params: URLSearchParams): string => {
  const query = queryOf(params);
  return query ? `${path}?${query}` : path;
};

const SECTION_PREFIX = "section:";
const DATES_PREFIX = "dates:";
const RANGE_SEPARATOR = "..";

/** `?close=` for a target: the inverse of `parseCloseTarget`. */
function closeParam(target: CloseTarget): string {
  switch (target.kind) {
    case "venue":
    case "tonight":
      return target.kind;
    case "date":
      return target.date;
    case "range":
      return `${target.from}${RANGE_SEPARATOR}${target.to}`;
    case "dates":
      return `${DATES_PREFIX}${target.dates.join(",")}`;
    case "section":
      return `${SECTION_PREFIX}${target.sectionId}`;
  }
}

/** One dialog over a view: a close target, or else the pause flag. */
type DialogRequest = { readonly close: CloseTarget } | { readonly pause: true } | null;

function setDialog(params: URLSearchParams, dialog: DialogRequest): void {
  params.delete("close");
  params.delete("pause");
  if (dialog && "close" in dialog) params.set("close", closeParam(dialog.close));
  else if (dialog) params.set("pause", "1");
}

/** The dialog and the Venue Setup flag every view carries, in that order, last in the query. */
function setOverlay(params: URLSearchParams, target: AvailabilityTarget): void {
  setDialog(params, target.close ? { close: target.close } : target.pause ? { pause: true } : null);
  if (target.from) params.set("from", target.from);
}

/**
 * The address for a target, so no caller hand-writes a path or a query string.
 *
 * The layout hosts the Close and Pause dialogs over any view (C2.4), so every address carries
 * them. A calendar date opens that day's drawer on today's page; a date that is not a real day is
 * dropped. Regular hours carries the service it opens. A named schedule or calendar view is
 * dropped until the view that reads it lands.
 */
export function availabilityPath(target: AvailabilityTarget): string {
  const params = new URLSearchParams();
  const ownPath = OWN_PATHS[target.view];
  if (ownPath) {
    if (target.view === "hours" && target.service) params.set("service", target.service);
    setOverlay(params, target);
    return withSearch(ownPath, params);
  }
  // A date names the calendar by itself (today's page opens Calendar for it), so it needs no tab.
  const date =
    target.view === "calendar" && target.date && isDate(target.date) ? target.date : null;
  const tab = PAGE_TAB[target.view];
  if (tab && !date) params.set("tab", tab);
  if (target.view === "seasonal" && target.screen === "new") params.set("action", "addSchedule");
  if (date) params.set("date", date);
  setOverlay(params, target);
  return withSearch(TODAYS_PAGE, params);
}

/**
 * The same search with `dialog` open in place of any dialog it named, every other param kept;
 * `null` removes both. The layout's `openClose`, `openPause` and its close use it.
 */
export function dialogSearch(search: string, dialog: DialogRequest): string {
  const params = new URLSearchParams(search);
  setDialog(params, dialog);
  const query = queryOf(params);
  return query ? `?${query}` : "";
}

const MAX_CLOSE_DATES = 20;

/**
 * Several dates, each once and in order (dates in this shape sort as text); one date left is that
 * date, so the dialog opens on "One date" rather than a list of one.
 */
function parseDates(listed: readonly string[]): CloseTarget | null {
  if (listed.length > MAX_CLOSE_DATES || !listed.every(isDate)) return null;
  const dates = [...new Set(listed)].sort();
  return dates.length === 1 ? { kind: "date", date: dates[0]! } : { kind: "dates", dates };
}

/** `<from>..<to>`; a range of one day is that date. */
function parseRange(value: string): CloseTarget | null {
  const [from, to, ...rest] = value.split(RANGE_SEPARATOR);
  if (from === undefined || to === undefined || rest.length > 0) return null;
  if (!isDate(from) || !isDate(to) || from > to) return null;
  return from === to ? { kind: "date", date: from } : { kind: "range", from, to };
}

function parseCloseTarget(value: string | null): CloseTarget | null {
  if (!value) return null;
  if (value === "venue" || value === "tonight") return { kind: value };
  if (isDate(value)) return { kind: "date", date: value };
  if (value.startsWith(SECTION_PREFIX)) {
    const sectionId = value.slice(SECTION_PREFIX.length);
    return sectionId ? { kind: "section", sectionId } : null;
  }
  if (value.startsWith(DATES_PREFIX))
    return parseDates(value.slice(DATES_PREFIX.length).split(","));
  return parseRange(value);
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
 * `?closeSection=<id>` becomes `?close=section:<id>`, which holds no old param, so the index
 * never redirects its own answer.
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
