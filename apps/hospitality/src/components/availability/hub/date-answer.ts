import { resolveDay, type Layer, type ResolvedDay } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { diffRemoval } from "../removal-diff.js";

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

function closedBandOf(day: ResolvedDay): DateAnswer["closedBand"] {
  return day.closures
    .filter((c) => c.targetKind === "venue")
    .reduce<DateAnswer["closedBand"]>(
      (first, c) => (first === null || c.from < first.from ? { from: c.from, to: c.to } : first),
      null
    );
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
  const at = layers.findIndex((l) => setsHours(l) || diffRemoval(day, l.removalResult).length > 0);
  const top = at === -1 ? undefined : layers[at];
  const deciding = top ? ruleOf(config, top) : null;
  const lower = top ? layers.slice(at + 1).find((l) => l.kind !== top.kind) : undefined;
  const beneath =
    top?.kind === "schedule"
      ? scheduleBeneath(config, timezone, date, top)
      : lower
        ? ruleOf(config, lower)
        : null;
  return {
    date,
    services: day.services.map(({ name, opensAt, closesAt }) => ({ name, opensAt, closesAt })),
    closedBand: closedBandOf(day),
    deciding,
    beneath,
    hubRow: deciding ? HUB_ROW[deciding.kind] : null,
  };
}
