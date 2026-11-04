import { decodeWeek } from "@mbe/availability";
import {
  AvailabilityChangeDetailSchema,
  type AvailabilityChangeDetail,
  type AvailabilityConfig,
  type ClosureAction,
  type DateRule,
  type TonightChange,
} from "@mbe/types";
import type { ConfigDiff } from "./availability-config-plan.js";

/**
 * The stable code and data of an audit row (`availability_changes.summary_detail`), written beside
 * its English `summary`. The server never words them in another language: a client maps the code
 * to its own catalog and falls back to `summary` for a row with none (docs/features/localization).
 */

const count = (part: Record<string, readonly unknown[]>) =>
  Object.values(part).reduce((n, rows) => n + rows.length, 0);

/**
 * What each weekday of the regular schedule (the live `isRegular` one) resolves to: per weekday,
 * the services that run and their hours. Read through `decodeWeek`, so row ids and how the week
 * is encoded into base hours and sets do not matter, only what a guest would be offered.
 */
function regularWeek(config: AvailabilityConfig) {
  const schedule = config.schedules.find((s) => s.isRegular && !s.archivedAt);
  if (!schedule) return { signatures: new Array<string>(7).fill("[]"), assignments: [] };
  const assignments = config.assignments.filter((a) => a.scheduleId === schedule.id);
  const live = new Set(config.venueServices.filter((v) => !v.archivedAt).map((v) => v.id));
  const rows = config.scheduleServices.filter(
    (r) => r.scheduleId === schedule.id && live.has(r.venueServiceId)
  );
  const week = decodeWeek(rows, [...new Set(assignments.flatMap((a) => a.weekdays))]);
  const signatures = Array.from({ length: 7 }, (_, day) =>
    JSON.stringify(
      week
        .flatMap((s) => {
          const h = s.days[day];
          return h
            ? [
                [
                  s.venueServiceId,
                  h.opensAt,
                  h.lastSeatingAt,
                  h.closesAt,
                  h.seating,
                  [...h.bookingTypes].sort(),
                ],
              ]
            : [];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    )
  );
  return { signatures, assignments };
}

/**
 * `regular_week_changed` (the weekdays whose hours changed, and when they take effect) when the
 * save changes which hours a regular-week weekday resolves to; otherwise `config_saved`. A rename,
 * or an edit to any schedule other than the regular one, leaves the regular week as it was.
 */
export function configSavedDetail(
  diff: ConfigDiff,
  before: AvailabilityConfig,
  after: AvailabilityConfig,
  today: string
): AvailabilityChangeDetail {
  const rows = {
    added: count(diff.create),
    changed: count(diff.update),
    removed: count(diff.remove),
  };
  const was = regularWeek(before);
  const now = regularWeek(after);
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => was.signatures[d] !== now.signatures[d]);
  if (weekdays.length === 0) return { code: "config_saved", ...rows };

  // An assignment with no start date, or one already started, takes effect with this save.
  const starts = now.assignments
    .filter((a) => a.weekdays.some((d) => weekdays.includes(d)))
    .map((a) => (a.startsOn && a.startsOn > today ? a.startsOn : today));
  const startsOn = starts.reduce((first, s) => (s < first ? s : first), starts[0] ?? today);
  return { code: "regular_week_changed", startsOn, weekdays, ...rows };
}

/** A saved closure, or a close-early (a `tonight` rule saved through the closure command). */
export function closureDetail(
  rule: Pick<DateRule, "kind" | "startsOn" | "endsOn">,
  counts: Record<ClosureAction, number>
): AvailabilityChangeDetail {
  return {
    code: rule.kind === "tonight" ? "close_early_saved" : "closure_saved",
    startsOn: rule.startsOn,
    endsOn: rule.endsOn ?? null,
    cancelled: counts.cancel,
    moved: counts.move,
    kept: counts.keep_notify + counts.keep_silent,
  };
}

/** A reopened closure, with its own first and last day: a one-day reopen is not open-ended. */
export const reopenedDetail = (
  rule: Pick<DateRule, "startsOn" | "endsOn">
): AvailabilityChangeDetail => ({
  code: "closure_reopened",
  startsOn: rule.startsOn,
  endsOn: rule.endsOn ?? null,
});

export function tonightDetail(change: TonightChange): AvailabilityChangeDetail {
  switch (change.type) {
    case "pause_online":
      return { code: "tonight_pause_online" };
    case "close_early":
      return { code: "tonight_close_early" };
    case "stop_window":
      return { code: "tonight_stop_window" };
    case "block_tables":
      return { code: "tonight_block_tables", tables: change.tableIds.length };
    case "pacing":
      return { code: "tonight_pacing", covers: change.covers };
  }
}

export const tonightEndedDetail = (): AvailabilityChangeDetail => ({ code: "tonight_ended" });

/** Reads a stored detail; `null` for a row written before details, or one that is not shaped like one. */
export function readDetail(value: unknown): AvailabilityChangeDetail | null {
  const parsed = AvailabilityChangeDetailSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * A revert's detail: the reverted change's, marked. `null` when that change has none, so the
 * revert too is shown as its English `Reverted: …` summary rather than a half-worded sentence.
 */
export function revertedDetail(original: unknown): AvailabilityChangeDetail | null {
  const detail = readDetail(original);
  return detail ? { ...detail, reverted: true } : null;
}
