import type { WeekChange } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";

/**
 * `weekChanges()` rows in the words staff use, for list_upcoming_changes: schedule, service and
 * section names instead of ids, times as venue-local HH:MM. Pure.
 */

const MINUTES_IN_DAY = 1440;

function clock(minute: number): string {
  const wall = minute % MINUTES_IN_DAY;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(wall / 60))}:${pad(wall % 60)}`;
}

/** The section ids a listed closure names, so their names are fetched only when needed. */
export function sectionIdsOf(changes: readonly WeekChange[], config: AvailabilityConfig): string[] {
  const rules = new Map(config.dateRules.map((r) => [r.id, r]));
  const ids = changes.flatMap((c) =>
    c.kind === "closure" ? [rules.get(c.ruleId)?.sectionId ?? null] : []
  );
  return [...new Set(ids.filter((id): id is string => id != null))];
}

interface Names {
  readonly service: (id: string) => string;
  readonly schedule: (id: string) => string;
  readonly section: (id: string) => string;
}

function scopeOf(rule: DateRule, names: Names) {
  const window = rule.window ? { from: clock(rule.window.from), to: clock(rule.window.to) } : {};
  if (rule.targetKind === "service" && rule.venueServiceId) {
    return { scope: "service", service: names.service(rule.venueServiceId), ...window };
  }
  if (rule.targetKind === "tables" && rule.sectionId) {
    return { scope: "section", section: names.section(rule.sectionId), ...window };
  }
  if (rule.targetKind === "venue") return { scope: "whole_venue", ...window };
  return { scope: rule.targetKind, ...window };
}

function specialServices(rule: DateRule | undefined, names: Names) {
  if (rule?.kind !== "special_hours") return [];
  return rule.payload.services.map((s) => ({
    service: names.service(s.venueServiceId),
    opens: clock(s.opensAt),
    closes: clock(s.closesAt),
  }));
}

function describe(change: WeekChange, rules: Map<string, DateRule>, names: Names) {
  switch (change.kind) {
    case "closure": {
      const rule = rules.get(change.ruleId);
      return { change: "closure", dates: change.dates, ...(rule ? scopeOf(rule, names) : {}) };
    }
    case "reopen":
      return { change: "reopen", date: change.date };
    case "specialHours":
      return {
        change: "special_hours",
        dates: change.dates,
        services: specialServices(rules.get(change.ruleId), names),
      };
    case "seasonalStarts":
      return {
        change: "schedule_starts",
        date: change.date,
        schedule: names.schedule(change.scheduleId),
      };
    case "seasonalEnds":
      return {
        change: "schedule_ends",
        date: change.date,
        schedule: names.schedule(change.scheduleId),
      };
    case "regularHours":
      return {
        change: "regular_hours_resume",
        date: change.date,
        schedule: names.schedule(change.scheduleId),
      };
  }
}

/**
 * Each row described, keeping one reopening per date: a chain of back-to-back venue closures
 * yields a reopen row per closure, all on the same first open day.
 */
export function describeWeekChanges(
  changes: readonly WeekChange[],
  config: AvailabilityConfig,
  sectionNames: ReadonlyMap<string, string>
) {
  const rules = new Map(config.dateRules.map((r) => [r.id, r]));
  const byId = <T extends { id: string; name: string }>(rows: readonly T[]) => {
    const map = new Map(rows.map((r) => [r.id, r.name]));
    return (id: string) => map.get(id) ?? id;
  };
  const names: Names = {
    service: byId(config.venueServices),
    schedule: byId(config.schedules),
    section: (id) => sectionNames.get(id) ?? id,
  };
  const firstReopenOn = (date: string) =>
    changes.findIndex((c) => c.kind === "reopen" && c.date === date);
  return changes
    .filter((c, i) => c.kind !== "reopen" || firstReopenOn(c.date) === i)
    .map((c) => describe(c, rules, names));
}
