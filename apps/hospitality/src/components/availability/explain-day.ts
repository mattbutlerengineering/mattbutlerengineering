import type { TFunction } from "i18next";
import { MINUTES_PER_DAY } from "@mbe/availability";
import type { TraceReason, TracedTime } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { availabilityPath } from "./availability-address.js";
import { closureEndText, minuteText } from "./closure-band.js";

/**
 * "Explain this day": every candidate time of a date with the first rule that removed it. The
 * server hands over a stable code and the rule's facts (`TraceReason`); the words are built here
 * from catalog keys and the venue's formats, so the English is never parsed.
 */

type Code = TraceReason["code"];

/** The screen that edits a rule; `floorPlan` is the one outside the Availability area. */
export type ExplainDestination =
  "closures" | "regularHours" | "bookingRules" | "floorPlan" | "calendar";

const DESTINATION: Readonly<Record<Code, ExplainDestination>> = {
  booking_paused: "closures",
  channel_not_offered: "regularHours",
  closure: "closures",
  nonexistent_local_time: "calendar",
  no_suitable_table: "floorPlan",
  no_free_table: "floorPlan",
  before_earliest: "bookingRules",
  after_latest_date: "bookingRules",
  pacing: "bookingRules",
};

/**
 * The screens only a Manager can open (a Host who followed one lands on the hub, or on the
 * dashboard). A Host keeps the links to Closures and the Calendar, which both read for a Host.
 */
const MANAGER_ONLY: ReadonlySet<ExplainDestination> = new Set([
  "regularHours",
  "bookingRules",
  "floorPlan",
]);

export const isManagerOnly = (destination: ExplainDestination): boolean =>
  MANAGER_ONLY.has(destination);

export const destinationOf = (reason: TraceReason): ExplainDestination => DESTINATION[reason.code];

const FLOOR_PLAN_PATH = "/floor-plans";

/** Where the deciding rule is edited; `service` and `date` aim the screen at this time. */
export function destinationPath(
  destination: ExplainDestination,
  time: Pick<TracedTime, "serviceId">,
  date: string
): string {
  switch (destination) {
    case "closures":
      return availabilityPath({ view: "closures" });
    case "regularHours":
      return availabilityPath({ view: "hours", service: time.serviceId });
    case "bookingRules":
      return availabilityPath({ view: "bookingRules" });
    case "calendar":
      return availabilityPath({ view: "calendar", date });
    case "floorPlan":
      return FLOOR_PLAN_PATH;
  }
}

/** A whole-day closure is stored as 0 to two days of minutes (ADR-029). */
const isWholeDay = (from: number, to: number): boolean => from === 0 && to >= 2 * MINUTES_PER_DAY;

const K = "availabilityExplain.reason";

function closureText(
  reason: Extract<TraceReason, { code: "closure" }>,
  time: TracedTime,
  t: TFunction,
  format: VenueFormat
): string {
  const window = isWholeDay(reason.from, reason.to)
    ? t(`${K}.window.allDay`)
    : t(`${K}.window.range`, {
        from: minuteText(reason.from, t, format),
        to: closureEndText(reason.to, t, format),
      });
  return t(`${K}.closure.${reason.targetKind}`, { service: time.serviceName, window });
}

/** The sentence for a removed time, with the rule's numbers, in the viewer's language. */
export function reasonText(
  reason: TraceReason,
  time: TracedTime,
  t: TFunction,
  format: VenueFormat
): string {
  const channel = (value: "online" | "phone") =>
    t(`availability.drawer.layer.bookingType.${value}`);
  switch (reason.code) {
    case "booking_paused":
      return t(`${K}.booking_paused`, { channel: channel(reason.channel) });
    case "channel_not_offered":
      return t(`${K}.channel_not_offered`, {
        service: time.serviceName,
        channel: channel(reason.channel),
      });
    case "closure":
      return closureText(reason, time, t, format);
    case "nonexistent_local_time":
      return t(`${K}.nonexistent_local_time`);
    case "no_suitable_table":
      return t(`${K}.no_suitable_table`, { partySize: reason.partySize });
    case "before_earliest":
      return t(`${K}.before_earliest`, {
        earliest: format.formatInstant(reason.earliest, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      });
    case "after_latest_date":
      return t(`${K}.after_latest_date`, {
        latest: format.formatCalendarDate(reason.latestLocalDate, {
          month: "long",
          day: "numeric",
        }),
      });
    case "no_free_table":
      return t(`${K}.no_free_table`, { tables: reason.suitableTables });
    case "pacing":
      return t(`${K}.pacing.${reason.scope}`, {
        service: time.serviceName,
        covers: reason.covers,
        limit: reason.limit,
        partySize: reason.partySize,
        time: minuteText(time.minute, t, format),
      });
  }
}

export interface ServiceTimes {
  readonly serviceId: string;
  readonly serviceName: string;
  readonly times: readonly TracedTime[];
}

/** The times grouped by service, in the order the trace lists them. */
export function groupByService(times: readonly TracedTime[]): readonly ServiceTimes[] {
  const groups = new Map<string, { serviceName: string; times: TracedTime[] }>();
  for (const time of times) {
    const group = groups.get(time.serviceId);
    if (group) group.times.push(time);
    else groups.set(time.serviceId, { serviceName: time.serviceName, times: [time] });
  }
  return [...groups].map(([serviceId, g]) => ({ serviceId, ...g }));
}

/** The reason most removed times share; the first one seen wins a tie. `null` when none was removed. */
export function commonReasonCode(times: readonly TracedTime[]): Code | null {
  const counts = new Map<Code, number>();
  for (const time of times) {
    if (time.reason) counts.set(time.reason.code, (counts.get(time.reason.code) ?? 0) + 1);
  }
  let best: Code | null = null;
  for (const [code, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) best = code;
  }
  return best;
}

/** "N times bookable for a party of 2; the most common reason times are missing is …". */
export function summaryText(times: readonly TracedTime[], partySize: number, t: TFunction): string {
  const bookable = times.filter((time) => time.outcome === "bookable").length;
  const head = t("availabilityExplain.summary.bookable", { count: bookable, partySize });
  const common = commonReasonCode(times);
  return common === null
    ? head
    : `${head} ${t("availabilityExplain.summary.commonReason", {
        reason: t(`availabilityExplain.reasonName.${common}`),
      })}`;
}
