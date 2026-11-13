import {
  resolveDay,
  type Layer,
  type ResolvedClosure,
  type ResolvedDay,
  type ResolvedDaySummary,
} from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";

/**
 * The hub's date check as data: what happens on one date, the rule that decided it, and the one
 * rule beneath (availability-hub architecture.md, `dateAnswer`). Rule precedence is the engine's:
 * this reads `resolveDay(...).explanation` and never orders rules itself. No text lives here.
 */

/** The rule a date answer names, by kind and by the schedule or date rule it refers to. */
export type DateAnswerRule =
  | {
      readonly kind: "regular" | "seasonal";
      readonly scheduleId: string;
      /** The schedule's name as stored. */
      readonly name: string;
    }
  | {
      readonly kind: "useHours" | "special" | "closure" | "tonight";
      /** The date rule's id. */
      readonly ruleId: string;
    };

/** The hub row a rule belongs to, numbered as the hub lists them; row 5 (booking rules) never decides a date. */
export type DateAnswerHubRow = 1 | 2 | 3 | 4;

/** A closed part of a service day, in service-day minutes. */
export interface DateAnswerBand {
  readonly from: number;
  readonly to: number;
}

export interface DateAnswer {
  readonly date: string;
  /** The services that run, in opening order; empty means closed. */
  readonly services: readonly {
    readonly name: string;
    readonly opensAt: number;
    readonly closesAt: number;
    /**
     * The parts of its hours a closure of this service alone takes, in order; absent when there
     * are none. The venue-wide bands are not repeated here.
     */
    readonly closed?: readonly DateAnswerBand[];
  }[];
  /**
   * The band the whole venue is closed for, in service-day minutes: the one the deciding rule is
   * part of, else the earliest. Closures that overlap or meet are one band.
   */
  readonly closedBand: DateAnswerBand | null;
  /** Every other venue-wide band on the date, in order; absent when there are none. */
  readonly otherClosedBands?: readonly DateAnswerBand[];
  /** `null` when no rule covers the date. */
  readonly deciding: DateAnswerRule | null;
  readonly beneath: DateAnswerRule | null;
  readonly hubRow: DateAnswerHubRow | null;
}

const HUB_ROW: Record<DateAnswerRule["kind"], DateAnswerHubRow> = {
  regular: 1,
  seasonal: 2,
  // "Same as another day" is a choice made on a special date.
  useHours: 3,
  special: 3,
  closure: 4,
  tonight: 4,
};

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!CIVIL_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The layers that set the day's hours; the top one answers for them even when it changes nothing. */
function setsHours(layer: Layer): boolean {
  return (
    layer.kind === "schedule" || layer.kind === "use_schedule" || layer.kind === "special_hours"
  );
}

function scheduleIdOf(config: AvailabilityConfig, layer: Layer): string | undefined {
  return config.assignments.find((a) => a.id === layer.id)?.scheduleId;
}

function ruleOf(config: AvailabilityConfig, layer: Layer): DateAnswerRule | null {
  switch (layer.kind) {
    case "schedule": {
      const scheduleId = scheduleIdOf(config, layer);
      // A schedule layer's id is always one of the config's assignments.
      if (scheduleId === undefined) return null;
      return {
        kind: layer.regularWeek ? "regular" : "seasonal",
        scheduleId,
        name: layer.scheduleName ?? layer.label,
      };
    }
    case "use_schedule":
      return { kind: "useHours", ruleId: layer.id };
    case "special_hours":
      return { kind: "special", ruleId: layer.id };
    case "closure":
      return { kind: "closure", ruleId: layer.id };
    case "tonight":
      return { kind: "tonight", ruleId: layer.id };
    case "skip":
      return null;
  }
}

/**
 * The hours a schedule wins over. The engine lists only the winning assignment, so the one
 * beneath is the winner once that schedule's assignments are gone.
 */
function scheduleBeneath(
  config: AvailabilityConfig,
  timezone: string,
  date: string,
  layer: Layer
): DateAnswerRule | null {
  const scheduleId = scheduleIdOf(config, layer);
  const without = {
    ...config,
    assignments: config.assignments.filter((a) => a.scheduleId !== scheduleId),
  };
  const lower = resolveDay({ timezone, config: without }, date).explanation.find(
    (l) => l.kind === "schedule"
  );
  return lower ? ruleOf(without, lower) : null;
}

function venueBandsOf(day: ResolvedDaySummary): ResolvedClosure[] {
  return day.closures.filter((c) => c.targetKind === "venue");
}

interface Span {
  readonly from: number;
  readonly to: number;
}

/** Spans as disjoint spans in order: two that overlap or meet become one. */
function mergedSpans(spans: readonly Span[]): Span[] {
  return spans
    .map(({ from, to }) => ({ from, to }))
    .sort((a, b) => a.from - b.from)
    .reduce<Span[]>((merged, span) => {
      const last = merged.at(-1);
      return last && span.from <= last.to
        ? [...merged.slice(0, -1), { from: last.from, to: Math.max(last.to, span.to) }]
        : [...merged, span];
    }, []);
}

/** The minutes the whole venue is closed for, as disjoint spans in order. */
function closedSpansOf(day: ResolvedDaySummary): Span[] {
  return mergedSpans(venueBandsOf(day));
}

/** What is left of `open` once the closed spans are taken out. */
function openSpans(open: Span, closed: readonly Span[]): Span[] {
  return closed.reduce<Span[]>(
    (left, band) =>
      left.flatMap((span) =>
        [
          { from: span.from, to: Math.min(span.to, band.from) },
          { from: Math.max(span.from, band.to), to: span.to },
        ].filter((piece) => piece.from < piece.to)
      ),
    open.from < open.to ? [open] : []
  );
}

interface ServiceReport {
  readonly name: string;
  readonly opensAt: number;
  readonly closesAt: number;
  /** The minutes it is open, outside every band that closes it. */
  readonly open: readonly Span[];
  /** The minutes of its hours closed for this service alone, outside the venue-wide bands. */
  readonly closed: readonly Span[];
}

/**
 * Each service with the bands that close it applied: the venue-wide ones, and those that name the
 * service. A closure of one service for part of the day changes that service's hours.
 */
function serviceReports(day: ResolvedDaySummary): ServiceReport[] {
  const venue = closedSpansOf(day);
  return day.services.map((service) => {
    const { name, opensAt, closesAt } = service;
    const own = mergedSpans(
      day.closures.filter(
        (c) => c.targetKind === "service" && c.venueServiceId === service.venueServiceId
      )
    );
    return {
      name,
      opensAt,
      closesAt,
      open: openSpans({ from: opensAt, to: closesAt }, mergedSpans([...venue, ...own])),
      closed: own.flatMap((band) =>
        openSpans({ from: Math.max(band.from, opensAt), to: Math.min(band.to, closesAt) }, venue)
      ),
    };
  });
}

/**
 * What an answer reports, as a comparable key: the minutes the whole venue is closed for, and
 * the minutes each service is open outside them and outside its own closures. A band another
 * band already covers, or hours moved inside a closed band, change nothing. Section and
 * booking-channel closures, pacing and online pauses are not reported, so a rule that changes
 * only those never decides a date.
 */
function reportKey(day: ResolvedDaySummary): string {
  const services = serviceReports(day)
    .map((s) => [s.name, s.open] as const)
    .filter(([, open]) => open.length > 0);
  return JSON.stringify([closedSpansOf(day), services]);
}

/** The services that run: one its own closures leave no minute of is closed, so it is not listed. */
function servicesOf(day: ResolvedDaySummary): DateAnswer["services"] {
  return serviceReports(day)
    .filter((s) => s.closed.length === 0 || s.open.length > 0)
    .map(({ name, opensAt, closesAt, closed }) => ({
      name,
      opensAt,
      closesAt,
      ...(closed.length > 0 ? { closed } : {}),
    }));
}

/**
 * The closures and tonight changes that change the report, top first. Each is tested with every
 * rule above it already removed, so of two rules that do the same thing the lower one is named.
 */
function decidingOverlays(
  config: AvailabilityConfig,
  timezone: string,
  day: ResolvedDay,
  overlays: readonly Layer[]
): Layer[] {
  return overlays.reduce(
    (state, layer) => {
      const without = {
        ...state.config,
        dateRules: state.config.dateRules.filter((r) => r.id !== layer.id),
      };
      const key = reportKey(resolveDay({ timezone, config: without }, day.serviceDate));
      return {
        config: without,
        key,
        found: key === state.key ? state.found : [...state.found, layer],
      };
    },
    { config, key: reportKey(day), found: [] as Layer[] }
  ).found;
}

/**
 * The venue-wide closed bands, the deciding rule's first: the span its own band is part of when
 * it has one, else the earliest on the date. Bands that overlap or meet are one span.
 */
function closedBandsOf(day: ResolvedDay, top: Layer | undefined): Span[] {
  const spans = closedSpansOf(day);
  const own = venueBandsOf(day).find((c) => c.ruleId === top?.id);
  const first = (own && spans.find((s) => s.from <= own.from && own.to <= s.to)) ?? spans[0];
  return first ? [first, ...spans.filter((s) => s !== first)] : [];
}

/** What happens on `date` and which rule decided it; `null` for a date that is not a real one. */
export function dateAnswer(
  config: AvailabilityConfig,
  timezone: string,
  date: string
): DateAnswer | null {
  if (!isRealDate(date)) return null;
  const day = resolveDay({ timezone, config }, date);
  // Top first. A skip is never named: the engine has already removed the rule it skips.
  const layers = day.explanation.filter((l) => l.kind !== "skip").reverse();
  const overlays = layers.filter((l) => !setsHours(l));
  // The rules that could be named, top first: the hours layers always can.
  const candidates = [
    ...decidingOverlays(config, timezone, day, overlays),
    ...layers.filter(setsHours),
  ];
  const top = candidates.at(0);
  const deciding = top ? ruleOf(config, top) : null;
  const lower = top ? candidates.slice(1).find((l) => l.kind !== top.kind) : undefined;
  const beneath =
    top?.kind === "schedule"
      ? scheduleBeneath(config, timezone, date, top)
      : lower
        ? ruleOf(config, lower)
        : null;
  const [closedBand, ...otherClosedBands] = closedBandsOf(day, top);
  return {
    date,
    services: servicesOf(day),
    closedBand: closedBand ?? null,
    ...(otherClosedBands.length > 0 ? { otherClosedBands } : {}),
    deciding,
    beneath,
    hubRow: deciding ? HUB_ROW[deciding.kind] : null,
  };
}
