import type { TFunction } from "i18next";
import type { AvailabilityChangeDetail } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { describeChange, outcomeText, whenOf } from "./describe-change.js";
import { weekdaySummary } from "./weekday-summary.js";

/**
 * One change as a sentence in the viewer's language: the Conflict dialog's list and the History
 * drawer both read it here. The server sends a stable code plus data (`detail`) and the English
 * `summary`; the code is worded from the catalog, and `summary` is shown only when there is no
 * code, the code is one this client does not know, or the data its sentence needs is missing.
 * Rows stored before codes existed have none, and are never parsed back from their English.
 */

/** A conflict's change, or a History entry (which adds the closure's counts and dates). */
type Change = Parameters<typeof describeChange>[0];

const isCount = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isInteger(value);

function tonightText(detail: AvailabilityChangeDetail, t: TFunction): string | null {
  switch (detail.code) {
    case "tonight_pause_online":
      return t("availability.history.summary.tonightPauseOnline");
    case "tonight_close_early":
      return t("availability.history.summary.tonightCloseEarly");
    case "tonight_stop_window":
      return t("availability.history.summary.tonightStopWindow");
    case "tonight_ended":
      return t("availability.history.summary.tonightEnded");
    case "tonight_block_tables":
      return isCount(detail.tables)
        ? t("availability.history.summary.tonightBlockTables", { count: detail.tables })
        : null;
    case "tonight_pacing":
      return isCount(detail.covers)
        ? t("availability.history.summary.tonightPacing", { count: detail.covers })
        : null;
    default:
      return null;
  }
}

/** The only codes `closureText` words; any other, whatever fields it carries, is unknown. */
const CLOSURE_CODES: ReadonlySet<string> = new Set([
  "closure_saved",
  "close_early_saved",
  "closure_reopened",
]);

function closureText(
  detail: AvailabilityChangeDetail,
  format: VenueFormat,
  t: TFunction
): string | null {
  const { code, startsOn, cancelled, moved, kept } = detail;
  if (!CLOSURE_CODES.has(code) || !startsOn) return null;
  const when = whenOf(startsOn, detail.endsOn, format, t);
  if (detail.code === "closure_reopened") {
    return when ? t("availability.history.entry.reopened", { when }) : null;
  }
  if (!isCount(cancelled) || !isCount(moved) || !isCount(kept)) return null;
  return t(
    detail.code === "close_early_saved"
      ? "availability.history.entry.closedEarly"
      : "availability.history.entry.closed",
    { when, outcome: outcomeText({ cancelled, moved, kept }, format, t) }
  );
}

/** "Changed regular week from Nov 6: Fri–Sat" (or "every day"); null when the start date or the weekdays are missing. */
function regularWeekText(
  detail: AvailabilityChangeDetail,
  format: VenueFormat,
  t: TFunction
): string | null {
  const { startsOn, weekdays } = detail;
  if (!startsOn || !weekdays || weekdays.length === 0) return null;
  const days = weekdaySummary(weekdays, format, t);
  return t("availability.history.summary.regularWeekChanged", {
    from: format.formatCalendarDate(startsOn, { month: "short", day: "numeric" }),
    days,
  });
}

function detailText(
  detail: AvailabilityChangeDetail,
  format: VenueFormat,
  t: TFunction
): string | null {
  const { added, changed, removed } = detail;
  const text =
    detail.code === "config_saved"
      ? isCount(added) && isCount(changed) && isCount(removed)
        ? t("availability.history.summary.configSaved", { added, changed, removed })
        : null
      : detail.code === "regular_week_changed"
        ? regularWeekText(detail, format, t)
        : detail.code.startsWith("tonight_")
          ? tonightText(detail, t)
          : closureText(detail, format, t);
  return text !== null && detail.reverted
    ? t("availability.history.summary.reverted", { summary: text })
    : text;
}

export function changeSummaryText(change: Change, format: VenueFormat, t: TFunction): string {
  const coded = change.detail ? detailText(change.detail, format, t) : null;
  return coded ?? describeChange(change, format, t) ?? change.summary;
}
