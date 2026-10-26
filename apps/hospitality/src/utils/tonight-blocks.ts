import { MINUTES_PER_DAY, addDays } from "@mbe/availability";
import type { DateRule } from "@mbe/types";

/**
 * Minutes into `serviceDate` that a staff form's date and `HH:MM` time fall at, or `null` when
 * they are not on that service day. The next calendar date counts: 12:30 AM Friday is minute
 * 1470 of Thursday's service day.
 */
export function bookingMinuteOnServiceDay(
  serviceDate: string,
  date: string,
  time: string
): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  if (date === serviceDate) return minute;
  if (date === addDays(serviceDate, 1)) return minute + MINUTES_PER_DAY;
  return null;
}

/**
 * Ids of tables a Tonight "block tables" rule holds for `serviceDate` during a booking that
 * starts at `startMinute` of that service day and lasts `durationMinutes`. Read from the config
 * the client already has, so the staff form never fans a check out per table.
 */
export function blockedTableIds(
  rules: readonly DateRule[],
  serviceDate: string,
  startMinute: number | null,
  durationMinutes: number
): ReadonlySet<string> {
  const blocked = new Set<string>();
  if (startMinute === null) return blocked;
  const end = startMinute + durationMinutes;
  for (const rule of rules) {
    if (rule.kind !== "tonight" || rule.targetKind !== "tables" || rule.startsOn !== serviceDate) {
      continue;
    }
    if (!("stop" in rule.payload)) continue;
    const { from, to } = rule.payload.stop;
    if (from < end && startMinute < to) {
      for (const id of rule.tableIds ?? []) blocked.add(id);
    }
  }
  return blocked;
}

/**
 * The closure that closes the waitlist on `serviceDate`: the rule whose note and Reopen the
 * waitlist notice offers. Only the shape the Close dialog creates counts (a booking-channel
 * closure naming the waitlist), so Reopen never deletes some other rule.
 */
export function waitlistClosingRule(
  rules: readonly DateRule[],
  serviceDate: string
): DateRule | null {
  return (
    rules.find(
      (rule) =>
        rule.kind === "closure" &&
        rule.targetKind === "booking" &&
        (rule.bookingTypes ?? []).includes("waitlist") &&
        rule.startsOn <= serviceDate &&
        (!rule.endsOn || serviceDate <= rule.endsOn)
    ) ?? null
  );
}
