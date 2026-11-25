import { addDays, resolveDay, weekdayIndexOf } from "@mbe/availability";
import { PREVIEW_PARTY_DEFAULT, PREVIEW_PARTY_MAX } from "@mbe/types";
import type {
  AvailabilityConfig,
  AvailabilityConfigChanges,
  LostDemandWhatIf,
  PreviewAvailabilityParsed,
  Seating,
  SpecialHoursService,
} from "@mbe/types";
import { prisma } from "./database.js";
import { getAvailabilityConfig, previewAvailabilityConfig } from "./availability-config.js";
import type { PreviewOutcome } from "./availability-config.js";
import { ANY_TIME_MINUTE } from "./lost-demand.js";
import { defaultWindowStart, lostDemandReportService } from "./lost-demand-report.js";

/**
 * "Add a seating at X" what-if on the Lost Demand Ledger (#9486). Read-only: the
 * candidate seating is an UNSAVED special-hours draft run through the same
 * availability preview the hours editor uses, so it never changes availability.
 *
 * Method, in plain words: take the weekday's current service that is nearest the
 * time, add the candidate time to its listed seatings, preview that draft for each
 * party size searched, and count the recorded no-slot searches on that weekday that
 * asked for a time within SEATING_WINDOW_MINUTES of the candidate, for parties the
 * preview says a table fits. It is an upper-ish guess: a turned-away guest might
 * not have booked, and a search is not a booking. Whole-day misses (no time named)
 * are returned separately and never added to the count.
 */

/** A search counts when it asked for a time this close to the candidate seating. */
export const SEATING_WINDOW_MINUTES = 30;
/** The kitchen stays open at least this long after a candidate last seating. */
const SEATING_TAIL_MINUTES = 60;
const MINUTES_PER_DAY = 24 * 60;
const MAX_DATE_SEARCH_DAYS = 7;
/** The id of the unsaved rule; it is never stored. */
const DRAFT_RULE_ID = "what-if-seating";

export interface SearchRow {
  /** Venue-local service date, YYYY-MM-DD. */
  date: string;
  requestedMinute: number;
  partySize: number;
  searches: number;
}

export interface WhatIfDeps {
  getConfig(venueId: string, now: Date): Promise<{ config: AvailabilityConfig } | null>;
  /** Today's service date at the venue. */
  today(venueId: string, now: Date): Promise<string>;
  readSearches(params: { venueId: string; from: string; to: string }): Promise<SearchRow[]>;
  preview(venueId: string, body: PreviewAvailabilityParsed, now: Date): Promise<PreviewOutcome>;
}

export interface EstimateParams {
  venueId: string;
  weekday: number;
  minute: number;
  minParty?: number;
  maxParty?: number;
  from?: string;
  to?: string;
  now: Date;
}

export type SeatingDraft =
  { kind: "closed" } | { kind: "draft"; changes: AvailabilityConfigChanges; focusDate: string };

const listedMinutes = (opensAt: number, lastSeatingAt: number, seating: Seating): number[] =>
  "interval" in seating
    ? Array.from(
        { length: Math.floor((lastSeatingAt - opensAt) / seating.interval) + 1 },
        (_, k) => opensAt + k * seating.interval
      )
    : [...seating.fixed];

const distanceTo = (s: { opensAt: number; closesAt: number }, minute: number): number =>
  Math.max(s.opensAt - minute, minute - s.closesAt, 0);

/** The weekday's current services with the candidate time added to the nearest one. */
export function buildSeatingDraft(
  config: AvailabilityConfig,
  focusDate: string,
  minute: number
): SeatingDraft {
  // resolveDay reads the config and the date only; the zone is not consulted.
  const { services } = resolveDay({ timezone: "UTC", config }, focusDate);
  if (services.length === 0) return { kind: "closed" };
  const target = services.reduce((best, s) =>
    distanceTo(s, minute) < distanceTo(best, minute) ? s : best
  );
  const resolved: SpecialHoursService[] = services.map((s) => {
    const base = {
      venueServiceId: s.venueServiceId,
      opensAt: s.opensAt,
      lastSeatingAt: s.lastSeatingAt,
      closesAt: s.closesAt,
      seating: s.seating,
      bookingTypes: s.bookingTypes,
    };
    if (s !== target) return base;
    const times = new Set([...listedMinutes(s.opensAt, s.lastSeatingAt, s.seating), minute]);
    return {
      ...base,
      opensAt: Math.min(s.opensAt, minute),
      lastSeatingAt: Math.max(s.lastSeatingAt, minute),
      closesAt: Math.max(s.closesAt, minute + SEATING_TAIL_MINUTES),
      seating: { version: 1, fixed: [...times].sort((a, b) => a - b) },
    };
  });
  return {
    kind: "draft",
    focusDate,
    changes: {
      upsert: {
        dateRules: [
          {
            id: DRAFT_RULE_ID,
            kind: "special_hours",
            targetKind: "venue",
            startsOn: focusDate,
            endsOn: null,
            repeat: { version: 1, weekdays: [weekdayIndexOf(focusDate)] },
            payload: { version: 1, services: resolved },
          },
        ],
      },
      remove: {},
    },
  };
}

/** First date strictly after `today` that falls on `weekday`. */
function nextOccurrence(today: string, weekday: number): string {
  for (let i = 1; i <= MAX_DATE_SEARCH_DAYS; i++) {
    const date = addDays(today, i);
    if (weekdayIndexOf(date) === weekday) return date;
  }
  return addDays(today, 1);
}

const clampParty = (n: number): number => Math.min(Math.max(n, 1), PREVIEW_PARTY_MAX);

async function servedParties(
  deps: WhatIfDeps,
  venueId: string,
  draft: Extract<SeatingDraft, { kind: "draft" }>,
  minute: number,
  sizes: readonly number[],
  now: Date
): Promise<{ blocked: boolean; served: Set<number> }> {
  const served = new Set<number>();
  for (const partySize of sizes) {
    const outcome = await deps.preview(
      venueId,
      {
        draft: { changes: draft.changes, scopeConflicts: "keep" },
        scope: { from: draft.focusDate },
        focusDate: draft.focusDate,
        strandedOffset: 0,
        compareWith: "saved",
        partySize,
      },
      now
    );
    if (outcome.kind !== "ok") return { blocked: true, served: new Set() };
    const day = outcome.result.days.find((d) => d.serviceDate === draft.focusDate);
    if (day?.added.includes(minute)) served.add(partySize);
  }
  return { blocked: false, served };
}

export async function estimateNewSeating(
  params: EstimateParams,
  deps: WhatIfDeps
): Promise<LostDemandWhatIf> {
  const { venueId, weekday, minute, now } = params;
  const minParty = params.minParty ?? null;
  const maxParty = params.maxParty ?? null;
  const to = params.to ?? (await deps.today(venueId, now));
  const from = params.from ?? defaultWindowStart(to);
  const windowStart = Math.max(minute - SEATING_WINDOW_MINUTES, 0);
  const windowEnd = Math.min(minute + SEATING_WINDOW_MINUTES, MINUTES_PER_DAY);

  const rows = (await deps.readSearches({ venueId, from, to })).filter(
    (r) =>
      new Date(`${r.date}T00:00:00.000Z`).getUTCDay() === weekday &&
      (minParty === null || r.partySize >= minParty) &&
      (maxParty === null || r.partySize <= maxParty)
  );
  const anyTimeSearches = rows
    .filter((r) => r.requestedMinute === ANY_TIME_MINUTE)
    .reduce((sum, r) => sum + r.searches, 0);
  const inWindow = rows.filter(
    (r) => r.requestedMinute >= windowStart && r.requestedMinute < windowEnd
  );

  const result = (outcome: LostDemandWhatIf["outcome"], searches: number): LostDemandWhatIf => ({
    venueId,
    from,
    to,
    weekday,
    minute,
    outcome,
    searches,
    windowStart,
    windowEnd,
    minParty,
    maxParty,
    anyTimeSearches,
  });

  const loaded = await deps.getConfig(venueId, now);
  if (!loaded) return result("closed", 0);
  const focusDate = nextOccurrence(await deps.today(venueId, now), weekday);
  const draft = buildSeatingDraft(loaded.config, focusDate, minute);
  if (draft.kind === "closed") return result("closed", 0);

  const searched = [...new Set(inWindow.map((r) => r.partySize))].filter(
    (n) => n <= PREVIEW_PARTY_MAX
  );
  const sizes = searched.length > 0 ? searched : [clampParty(minParty ?? PREVIEW_PARTY_DEFAULT)];
  const { blocked, served } = await servedParties(deps, venueId, draft, minute, sizes, now);
  if (blocked) return result("blocked", 0);
  if (served.size === 0) return result("already_offered", 0);

  const searches = inWindow
    .filter((r) => served.has(r.partySize))
    .reduce((sum, r) => sum + r.searches, 0);
  return result("estimated", searches);
}

async function readSearches(params: {
  venueId: string;
  from: string;
  to: string;
}): Promise<SearchRow[]> {
  const groups = await prisma.noSlotSearch.groupBy({
    by: ["date", "requestedMinute", "partySize"],
    where: {
      venueId: params.venueId,
      date: {
        gte: new Date(`${params.from}T00:00:00.000Z`),
        lte: new Date(`${params.to}T00:00:00.000Z`),
      },
    },
    _sum: { searches: true },
  });
  return groups.map((g) => ({
    date: g.date.toISOString().slice(0, 10),
    requestedMinute: g.requestedMinute,
    partySize: g.partySize,
    searches: g._sum?.searches ?? 0,
  }));
}

const liveDeps: WhatIfDeps = {
  async getConfig(venueId, now) {
    const stored = await getAvailabilityConfig(venueId, now);
    return stored ? { config: stored.config } : null;
  },
  async today(venueId, now) {
    return (await lostDemandReportService.defaultWindow(venueId, now)).to;
  },
  readSearches,
  preview: (venueId, body, now) => previewAvailabilityConfig({ venueId, body, now }),
};

export const lostDemandWhatIfService = {
  estimate: (params: EstimateParams): Promise<LostDemandWhatIf> =>
    estimateNewSeating(params, liveDeps),
};
