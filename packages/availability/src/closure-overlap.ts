import type { ClosedByRule, ClosureOverlap, DateRule } from "@mbe/types";
import { addDays, weekdayIndexOf } from "./civil-date.js";
import { activeRules, WHOLE_DAY, type RuleOf } from "./date-rules.js";
import type { ServiceDate } from "./types.js";

/**
 * Other closures over the same dates. Two closures of one date are both stored and neither knows
 * of the other, so a Manager has to be told: before adding one that changes nothing, and when
 * reopening one leaves the date closed by the other (#8006). Pure; nothing here refuses a save.
 */

/** How far an open-ended rule is read: the API's cap on a dated closure's span. */
const OPEN_END_DAYS = 366;

type Closure = RuleOf<"closure">;

/** The rule's own dates on or after `from`, by range and weekdays. */
function datesOf(rule: DateRule, from: ServiceDate): ServiceDate[] {
  const first = rule.startsOn > from ? rule.startsOn : from;
  // A skip or one-date edit of a series never outgrows its date (see `date-rules.ts`).
  if (rule.seriesId != null) return rule.startsOn >= from ? [rule.startsOn] : [];
  const last = rule.endsOn ?? addDays(first, OPEN_END_DAYS);
  const dates: ServiceDate[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (rule.repeat == null || rule.repeat.weekdays.includes(weekdayIndexOf(date))) {
      dates.push(date);
    }
  }
  return dates;
}

const isClosure = (rule: DateRule): rule is Closure => rule.kind === "closure";

/** Whether `wide` shuts everything `narrow` targets. */
function targetCovers(wide: DateRule, narrow: DateRule): boolean {
  if (wide.targetKind === "venue") return true;
  if (wide.targetKind !== narrow.targetKind) return false;
  switch (wide.targetKind) {
    case "service":
      return wide.venueServiceId === narrow.venueServiceId;
    case "booking":
      return (narrow.bookingTypes ?? []).every((t) => wide.bookingTypes?.includes(t));
    default:
      return (narrow.tableIds ?? []).every((t) => wide.tableIds?.includes(t));
  }
}

function windowCovers(wide: DateRule, narrow: DateRule): boolean {
  const [w, n] = [wide.window ?? WHOLE_DAY, narrow.window ?? WHOLE_DAY];
  return w.from <= n.from && w.to >= n.to;
}

const covers = (wide: DateRule, narrow: DateRule) =>
  targetCovers(wide, narrow) && windowCovers(wide, narrow);

function closedBy(rule: Closure, dates: readonly ServiceDate[]): ClosedByRule {
  return {
    ruleId: rule.id,
    targetKind: rule.targetKind,
    venueServiceId: rule.venueServiceId,
    bookingTypes: rule.bookingTypes,
    startsOn: rule.startsOn,
    endsOn: rule.endsOn,
    repeat: rule.repeat,
    window: rule.window,
    dates: [...dates],
  };
}

/** One entry per closure, keeping the order they were first met in. */
function overlap(
  found: readonly { readonly date: ServiceDate; readonly rules: readonly Closure[] }[],
  everyDate: boolean
): ClosureOverlap {
  const rules = new Map(found.flatMap((f) => f.rules.map((r) => [r.id, r] as const)));
  return {
    everyDate,
    by: [...rules.values()].map((rule) =>
      closedBy(
        rule,
        found.filter((f) => f.rules.some((r) => r.id === rule.id)).map((f) => f.date)
      )
    ),
  };
}

/**
 * The closures that already shut what `draft` would, on its dates from `from` on. A channel pause
 * is its own thing: only a pause covers a pause, not a closed venue, whose reopening would not lift
 * the pause. So is a one-date edit of a series: the series it replaces does not count.
 */
export function alreadyClosed(
  rules: readonly DateRule[],
  draft: DateRule,
  from: ServiceDate
): ClosureOverlap {
  const counts = (rule: Closure) =>
    rule.id !== draft.id &&
    rule.id !== draft.seriesId &&
    (draft.seriesId == null || rule.seriesId !== draft.seriesId) &&
    (draft.targetKind !== "booking" || rule.targetKind === "booking") &&
    covers(rule, draft);
  const dates = datesOf(draft, from);
  const found = dates.map((date) => ({
    date,
    rules: activeRules(rules, date).filter(isClosure).filter(counts),
  }));
  const hits = found.filter((f) => f.rules.length > 0);
  return overlap(hits, dates.length > 0 && hits.length === dates.length);
}

/**
 * What stays closed once `rule` and its series' own skips and edits are gone. `by` also names a
 * service or a part of the day that stays closed under a reopened venue closure; `everyDate` only
 * holds when each date stays shut for all that `rule` shut, so nothing comes back to guests.
 */
export function stillClosedAfterReopen(
  rules: readonly DateRule[],
  rule: DateRule,
  from: ServiceDate
): ClosureOverlap {
  if (rule.kind !== "closure") return { everyDate: false, by: [] };
  const after = rules.filter((r) => r.id !== rule.id && r.seriesId !== rule.id);
  const dates = datesOf(rule, from).filter((date) =>
    activeRules(rules, date).some((r) => r.id === rule.id)
  );
  const staying = (other: Closure) =>
    targetCovers(other, rule) || (rule.targetKind === "venue" && other.targetKind === "service");
  const found = dates.map((date) => ({
    date,
    rules: activeRules(after, date).filter(isClosure).filter(staying),
  }));
  const hits = found.filter((f) => f.rules.length > 0);
  const shut = found.filter((f) => f.rules.some((other) => covers(other, rule)));
  return overlap(hits, dates.length > 0 && shut.length === dates.length);
}
