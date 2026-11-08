import type { DateRule } from "@mbe/types";

/**
 * The facts behind a "Why this day" layer's `label` and `effect`, as data. The two strings are
 * en-US prose; a reader in another language renders from these instead, so nothing parses
 * English. Every field is optional: a reader falls back to the strings when one is absent.
 */

/** What a closure (or a skipped series) closes. */
export interface LayerTarget {
  kind: DateRule["targetKind"];
  /** The service a `service` target closes, as stored. */
  serviceName?: string;
  /** The section a section closure is for (ADR-032); a reader looks its name up. */
  sectionId?: string;
  bookingTypes?: NonNullable<DateRule["bookingTypes"]>;
}

export interface LayerHoursService {
  name: string;
  opensAt: number;
  closesAt: number;
}

/** The series a skip takes one date out of. */
export interface LayerSeries {
  target: LayerTarget;
  /** 0 = Sunday, as stored. */
  weekdays?: number[];
  startsOn: string;
  endsOn?: string;
}

export type LayerTonight =
  { closeAt: number } | { stop: { from: number; to: number } } | { pacingCovers: number };

export interface LayerDetail {
  /** `schedule` and `use_schedule`: the schedule's name as stored. */
  scheduleName?: string;
  /** `schedule`: the venue's regular week, which nothing done on a date removes. */
  regularWeek?: true;
  /** `schedule`, `use_schedule` and `special_hours`: the services in force; empty means closed. */
  hours?: LayerHoursService[];
  /** `closure`: what it closes. */
  target?: LayerTarget;
  /** `closure`: the minutes it closes; absent means all day. */
  window?: { from: number; to: number };
  /** `skip` of a series; absent for a skipped date whose series is gone. */
  skippedFrom?: LayerSeries;
  /** `tonight`: what Tonight does. */
  tonight?: LayerTonight;
}

export function targetOf(rule: DateRule, serviceName: string | undefined): LayerTarget {
  return {
    kind: rule.targetKind,
    ...(serviceName !== undefined ? { serviceName } : {}),
    ...(rule.targetKind === "tables" && rule.sectionId ? { sectionId: rule.sectionId } : {}),
    ...(rule.bookingTypes ? { bookingTypes: [...rule.bookingTypes] } : {}),
  };
}

export function hoursOf(
  services: readonly { name: string; opensAt: number; closesAt: number }[]
): LayerHoursService[] {
  return services.map(({ name, opensAt, closesAt }) => ({ name, opensAt, closesAt }));
}

export function seriesOf(rule: DateRule, serviceName: string | undefined): LayerSeries {
  return {
    target: targetOf(rule, serviceName),
    ...(rule.repeat ? { weekdays: [...rule.repeat.weekdays] } : {}),
    startsOn: rule.startsOn,
    ...(rule.endsOn != null ? { endsOn: rule.endsOn } : {}),
  };
}

export function tonightOf(
  payload: Extract<DateRule, { kind: "tonight" }>["payload"]
): LayerTonight {
  if ("closeAt" in payload) return { closeAt: payload.closeAt };
  if ("stop" in payload) return { stop: { from: payload.stop.from, to: payload.stop.to } };
  return { pacingCovers: payload.pacing.covers };
}
