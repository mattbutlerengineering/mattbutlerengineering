import { closureEndText, minuteText } from "../closure-band.js";
import { weekdaySummary } from "../weekday-summary.js";
import type {
  ClosuresRow,
  HubClosure,
  HubClosureTarget,
  HubOnlinePause,
  HubTonightChange,
} from "./hub-closures.js";
import { shortDate, type HubTextContext } from "./hub-text.js";

/** Hub row 4, closures and pauses, in words (see `hub-row-text.ts`). Pure: no React. */

const END_OF_SERVICE_DAY = 2880;

function pauseText(pause: HubOnlinePause, today: string, ctx: HubTextContext): string {
  const { t, format } = ctx;
  if (!pause.inForce && pause.fromMinute !== null) {
    return t("availabilityHub.hub.closures.pauseWaiting", {
      time: minuteText(pause.fromMinute, t, format),
    });
  }
  // A pause for part of the day is over at its own time, whatever date it runs to.
  if (pause.untilMinute !== null) {
    return t("availabilityHub.hub.closures.pauseUntilTime", {
      time: minuteText(pause.untilMinute, t, format),
    });
  }
  if (pause.endsOn === null) return t("availabilityHub.hub.closures.pauseUntilResumed");
  return pause.endsOn === today
    ? t("availabilityHub.hub.closures.pauseTonight")
    : t("availabilityHub.hub.closures.pauseUntil", { date: shortDate(pause.endsOn, ctx) });
}

function tonightText(change: HubTonightChange, { t, format }: HubTextContext): string {
  if (change.closeAt !== null) {
    return t("availabilityHub.hub.closures.closingEarly", {
      time: minuteText(change.closeAt, t, format),
    });
  }
  // A change is a close-early or a stop, so a stop always has its window.
  const { from, to } = change.window ?? { from: 0, to: END_OF_SERVICE_DAY };
  return t("availabilityHub.hub.closures.stopTonight", {
    from: minuteText(from, t, format),
    to: closureEndText(to, t, format),
  });
}

/** What is closed. A section or service whose name is not known is never worded as the venue. */
function whatText(target: HubClosureTarget, { t, format }: HubTextContext): string {
  switch (target.kind) {
    case "venue":
      return t("availabilityHub.hub.closures.what.venue");
    case "service":
      return target.name === null
        ? t("availabilityHub.hub.closures.what.service")
        : t("availabilityHub.hub.closures.what.named", { name: target.name });
    case "section":
      return target.name === null
        ? t("availabilityHub.hub.closures.what.section")
        : t("availabilityHub.hub.closures.what.named", { name: target.name });
    case "tables":
      return t("availabilityHub.hub.closures.what.tables", { count: target.count });
    case "booking": {
      if (target.channels.length === 0) return t("availabilityHub.hub.closures.what.bookingAll");
      const channels = new Intl.ListFormat(format.locale, { type: "conjunction" }).format(
        target.channels.map((channel) => t(`setup.hub.channelLabel.${channel}`))
      );
      return t("availabilityHub.hub.closures.what.booking", { channels });
    }
  }
}

/** When a closure is read: in force or not, and on which date. */
interface Reading {
  readonly inForce: boolean;
  readonly today: string;
}

/** In force from yesterday's service day, which still runs past midnight. */
const sinceLastNight = (closure: HubClosure, { inForce, today }: Reading) =>
  inForce && closure.nextOn < today;

/**
 * How long it lasts. A one-date closure says "today" only while it is in force on today's date:
 * one still running from last night says since when, never "today".
 */
function whenText(closure: HubClosure, reading: Reading, ctx: HubTextContext): string | null {
  const { t, format } = ctx;
  if (closure.weekdays !== null) {
    const days = weekdaySummary(closure.weekdays, format, t);
    return closure.endsOn === null
      ? t("availabilityHub.hub.closures.when.repeatingOpen", { days })
      : t("availabilityHub.hub.closures.when.repeating", {
          days,
          date: shortDate(closure.endsOn, ctx),
        });
  }
  if (closure.endsOn === null) return t("availabilityHub.hub.closures.when.untilReopened");
  if (closure.endsOn === closure.startsOn) {
    if (!reading.inForce) return null;
    if (!sinceLastNight(closure, reading)) return t("availabilityHub.hub.closures.when.today");
    return closure.window === null ? t("availabilityHub.hub.closures.sinceYesterday") : null;
  }
  return t("availabilityHub.hub.closures.when.until", { date: shortDate(closure.endsOn, ctx) });
}

function windowText(closure: HubClosure, reading: Reading, ctx: HubTextContext): string | null {
  const { t, format } = ctx;
  const { window } = closure;
  if (window === null) return null;
  if (sinceLastNight(closure, reading)) {
    return t("availabilityHub.hub.closures.sinceLastNight", {
      time: minuteText(window.from, t, format),
    });
  }
  return window.to >= END_OF_SERVICE_DAY
    ? t("availabilityHub.hub.closures.windowFrom", { time: minuteText(window.from, t, format) })
    : t("availabilityHub.hub.closures.windowBetween", {
        from: minuteText(window.from, t, format),
        to: minuteText(window.to, t, format),
      });
}

function detailText(closure: HubClosure, reading: Reading, ctx: HubTextContext): string {
  return [whenText(closure, reading, ctx), windowText(closure, reading, ctx)]
    .filter((part): part is string => part !== null)
    .join(", ");
}

function nowText(closure: HubClosure, today: string, ctx: HubTextContext): string {
  const what = whatText(closure.target, ctx);
  const detail = detailText(closure, { inForce: true, today }, ctx);
  return detail ? ctx.t("availabilityHub.hub.closures.now", { what, detail }) : what;
}

function nextText(closure: HubClosure, today: string, ctx: HubTextContext): string {
  const values = { date: shortDate(closure.nextOn, ctx), what: whatText(closure.target, ctx) };
  const detail = detailText(closure, { inForce: false, today }, ctx);
  return detail
    ? ctx.t("availabilityHub.hub.closures.nextDetail", { ...values, detail })
    : ctx.t("availabilityHub.hub.closures.next", values);
}

/** One line of the row, with the rule it reads; the "None" line reads no rule. */
export interface ClosuresLine {
  readonly text: string;
  readonly ruleId?: string;
}

/** The row's lines: the pause, tonight's changes, what is closed now, then the next closure. */
export function closuresLines(
  row: ClosuresRow,
  today: string,
  ctx: HubTextContext
): ClosuresLine[] {
  const { pause, next } = row;
  const lines = [
    ...(pause ? [{ ruleId: pause.ruleId, text: pauseText(pause, today, ctx) }] : []),
    ...row.tonight.map((change) => ({ ruleId: change.ruleId, text: tonightText(change, ctx) })),
    ...row.now.map((closure) => ({ ruleId: closure.ruleId, text: nowText(closure, today, ctx) })),
    ...(next ? [{ ruleId: next.ruleId, text: nextText(next, today, ctx) }] : []),
  ];
  return lines.length > 0 ? lines : [{ text: ctx.t("availabilityHub.hub.closures.empty") }];
}
