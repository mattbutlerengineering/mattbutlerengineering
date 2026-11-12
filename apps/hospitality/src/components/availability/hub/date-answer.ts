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

export interface DateAnswer {
  readonly date: string;
  /** The services that run, in opening order; empty means closed. */
  readonly services: readonly {
    readonly name: string;
    readonly opensAt: number;
    readonly closesAt: number;
  }[];
  /** The earliest band the whole venue is closed for, in service-day minutes. */
  readonly closedBand: { readonly from: number; readonly to: number } | null;
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

/**
 * What an answer reports, as a comparable key: the services with their hours, and the bands the
 * whole venue is closed for. Section and booking-channel closures, pacing and online pauses are
 * not reported, so a rule that changes only those never decides a date.
 */
function reportKey(day: ResolvedDaySummary): string {
  const services = day.services.map((s) => [s.name, s.opensAt, s.closesAt]);
  const bands = [...new Set(venueBandsOf(day).map((c) => `${c.from}-${c.to}`))].sort();
  return JSON.stringify([services, bands]);
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

/** The deciding rule's own venue-wide band when it has one, else the earliest on the date. */
function closedBandOf(day: ResolvedDay, top: Layer | undefined): DateAnswer["closedBand"] {
  const bands = venueBandsOf(day);
  const band =
    bands.find((c) => c.ruleId === top?.id) ??
    bands.reduce<ResolvedClosure | undefined>(
      (first, c) => (first === undefined || c.from < first.from ? c : first),
      undefined
    );
  return band ? { from: band.from, to: band.to } : null;
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
  return {
    date,
    services: day.services.map(({ name, opensAt, closesAt }) => ({ name, opensAt, closesAt })),
    closedBand: closedBandOf(day, top),
    deciding,
    beneath,
    hubRow: deciding ? HUB_ROW[deciding.kind] : null,
  };
}
