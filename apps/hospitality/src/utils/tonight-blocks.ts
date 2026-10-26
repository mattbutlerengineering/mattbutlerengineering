import { MINUTES_PER_DAY, activeRules, addDays, resolveDay } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";

/**
 * The minute of `serviceDate` that a staff form's date and `HH:MM` time fall at, or `null` when
 * the booking belongs to another service day (or to none). Mirrors the engine's
 * `owningServiceDay`: the booking's own calendar date owns it when that day's planned services
 * are open then; otherwise the day before does, while its past-midnight service still runs
 * (12:30 AM Friday is minute 1470 of Thursday's service day). Closures and Tonight changes are
 * stripped first, so a block never changes which day owns the booking.
 */
export function bookingMinuteOnServiceDay(
  config: AvailabilityConfig,
  timeZone: string,
  serviceDate: string,
  date: string,
  time: string
): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !date) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  const planned: AvailabilityConfig = {
    ...config,
    dateRules: config.dateRules.filter((r) => r.kind !== "closure" && r.kind !== "tonight"),
  };
  const isOpen = (day: string, at: number): boolean =>
    resolveDay({ timezone: timeZone, config: planned }, day).services.some(
      (s) => s.opensAt <= at && at < s.closesAt
    );
  const owner =
    [
      { day: date, at: minute },
      { day: addDays(date, -1), at: minute + MINUTES_PER_DAY },
    ].find((c) => isOpen(c.day, c.at)) ?? null;
  return owner && owner.day === serviceDate ? owner.at : null;
}

/**
 * Ids of tables a Tonight "block tables" rule holds for `serviceDate` at `startMinute` of that
 * service day. Same test as the engine: `from <= start < to`. Read from the config the client
 * already has, so the staff form never fans a check out per table.
 */
export function blockedTableIds(
  rules: readonly DateRule[],
  serviceDate: string,
  startMinute: number | null
): ReadonlySet<string> {
  const blocked = new Set<string>();
  if (startMinute === null) return blocked;
  for (const rule of rules) {
    if (rule.kind !== "tonight" || rule.targetKind !== "tables" || rule.startsOn !== serviceDate) {
      continue;
    }
    if (!("stop" in rule.payload)) continue;
    const { from, to } = rule.payload.stop;
    if (from <= startMinute && startMinute < to) {
      for (const id of rule.tableIds ?? []) blocked.add(id);
    }
  }
  return blocked;
}

/**
 * The whole-day waitlist closure in force on `serviceDate`, after repeats, series skips and
 * one-date edits are applied (the engine's own `activeRules`). Only the shape the Close dialog
 * creates counts: a booking-channel closure naming the waitlist, with no time window.
 */
export function waitlistClosingRule(
  rules: readonly DateRule[],
  serviceDate: string
): DateRule | null {
  return (
    activeRules(rules, serviceDate).find(
      (rule) =>
        rule.kind === "closure" &&
        rule.targetKind === "booking" &&
        !rule.window &&
        (rule.bookingTypes ?? []).includes("waitlist")
    ) ?? null
  );
}

/**
 * Whether Reopen may delete this closure: it closes only the waitlist and only the one date.
 * Reopening deletes the whole rule, so a multi-channel, ranged, open-ended or repeating rule
 * goes to the Special dates tab instead.
 */
export function isTonightOnlyWaitlistClosure(rule: DateRule): boolean {
  const types = rule.bookingTypes ?? [];
  return (
    types.length === 1 && types[0] === "waitlist" && !rule.repeat && rule.endsOn === rule.startsOn
  );
}
