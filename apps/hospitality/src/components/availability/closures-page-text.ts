import { minuteText } from "./closure-band.js";
import type { ClosureListRow, EarlierClosureRow } from "./closures-list.js";
import { detailText, whatText } from "./hub/hub-closures-text.js";
import type { HubClosure } from "./hub/hub-closures.js";
import type { HubTextContext } from "./hub/hub-text.js";

/**
 * The Closures and pauses page in words (availability-hub ux.md, "Closures and pauses"). It reads
 * the hub's row 4 wording (`hub/hub-closures-text.ts`), so the page and the hub never name one
 * closure two ways. Pure: no React, no catalog import; the caller hands over `t` and the formats.
 */

/** The row's facts in the shape the hub's wording reads: `nextOn` is the date the row stands on. */
const asHubClosure = (row: ClosureListRow): HubClosure => ({
  ruleId: row.ruleId,
  target: row.target,
  nextOn: row.on ?? row.startsOn,
  startsOn: row.startsOn,
  endsOn: row.endsOn,
  weekdays: row.weekdays,
  window: row.window,
});

/** "Online booking paused", with the time it starts when it covers only part of the day. */
function pauseText(row: ClosureListRow, ctx: HubTextContext): string {
  const { t, format } = ctx;
  const paused = t("availability.paused.banner");
  return row.window
    ? `${paused} ${t("availabilityHub.hub.closures.windowFrom", {
        time: minuteText(row.window.from, t, format),
      })}`
    : paused;
}

/**
 * The line a row is headed by. A closure in force reads as the hub's row 4 does ("Patio closed
 * until reopened"). One still to come leads with the date it next closes ("Thu, Nov 26: Closed"),
 * and a repeating one says its weekdays instead ("Patio closed every Monday until Jan 25").
 */
export function closureRowTitle(row: ClosureListRow, today: string, ctx: HubTextContext): string {
  const { t } = ctx;
  const closure = asHubClosure(row);
  // A pause is resumed, so one with no end date says "until resumed", as the hub's row 4 does.
  if (row.pause && row.endsOn === null && row.window === null) {
    return t("availabilityHub.hub.closures.pauseUntilResumed");
  }
  const what = row.pause ? pauseText(row, ctx) : whatText(row.target, ctx);
  const reading = { inForce: row.group === "now", today };
  const detail = detailText(closure, reading, ctx);
  if (row.group === "now" || row.weekdays !== null) {
    return detail ? t("availabilityHub.hub.closures.now", { what, detail }) : what;
  }
  const date = ctx.format.formatCalendarDate(closure.nextOn, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return detail
    ? t("availabilityHub.closuresPage.datedDetail", { date, what, detail })
    : t("availabilityHub.closuresPage.dated", { date, what });
}

/** The row's dates alone, which its buttons name themselves by ("Edit Thu, Nov 26"). */
export function closureRowDate(
  row: ClosureListRow | EarlierClosureRow,
  ctx: HubTextContext
): string {
  const date = "startsOn" in row ? row.startsOn : (row.closure?.startsOn ?? null);
  return date === null
    ? ctx.t("availabilityHub.closuresPage.earlier.removed")
    : ctx.format.formatCalendarDate(date, { weekday: "short", month: "short", day: "numeric" });
}

/** An earlier row: when it closed, or why refunds are still owed for something no longer listed. */
export function earlierRowTitle(row: EarlierClosureRow, ctx: HubTextContext): string {
  const { t } = ctx;
  if (row.reason === "tonight") return t("availabilityHub.closuresPage.earlier.tonight");
  if (row.closure === null || row.reason === "removed") {
    return t("availabilityHub.closuresPage.earlier.removed");
  }
  const date = closureRowDate(row, ctx);
  const what = whatText(row.closure.target, ctx);
  return t("availabilityHub.closuresPage.dated", { date, what });
}
