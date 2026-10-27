import type { TFunction } from "i18next";
import { MINUTES_PER_DAY } from "@mbe/availability";
import type { AvailabilityDaySummary } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";

type Closure = AvailabilityDaySummary["closures"][number];

export interface ClosureBandText {
  readonly key: string;
  /** Visible text: "Closed 10:00 PM – 11:00 PM". */
  readonly text: string;
  /** Spoken in a cell's name: "closed 10:00 PM – 11:00 PM". */
  readonly name: string;
}

/** A minute past the service day's midnight as venue wall-clock text; past 24:00 reads "(next day)". */
export function minuteText(minute: number, t: TFunction, format: VenueFormat): string {
  const wrapped = minute % MINUTES_PER_DAY;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  const time = format.formatLocalTime(`${hh}:${mm}`);
  return minute >= MINUTES_PER_DAY ? t("availability.calendar.nextDay", { time }) : time;
}

/** A whole-day closure is stored as 0 to two days of minutes (ADR-029). */
export function isWholeDay(closure: Pick<Closure, "from" | "to">): boolean {
  return closure.from === 0 && closure.to >= 2 * MINUTES_PER_DAY;
}

interface Copy {
  allDay: (t: TFunction) => readonly [text: string, name: string];
  band: (t: TFunction, v: { from: string; to: string }) => readonly [text: string, name: string];
}

/** Channel-specific booking copy; the generic ("") one covers several channels or none named. */
const CHANNEL_SUFFIX = { online: "Online", phone: "Phone", waitlist: "Waitlist" } as const;

type ChannelSuffix = "" | (typeof CHANNEL_SUFFIX)[keyof typeof CHANNEL_SUFFIX];

function channelSuffix(closure: Closure): ChannelSuffix {
  const [only, ...rest] = closure.bookingTypes ?? [];
  return only && rest.length === 0 ? CHANNEL_SUFFIX[only] : "";
}

function bookingCopy(suffix: ChannelSuffix): Copy {
  return {
    allDay: (t) => [
      t(`availability.calendar.bookingOff${suffix}AllDay`),
      t(`availability.calendar.bookingOff${suffix}AllDayName`),
    ],
    band: (t, v) => [
      t(`availability.calendar.bookingOff${suffix}Band`, v),
      t(`availability.calendar.bookingOff${suffix}BandName`, v),
    ],
  };
}

/** Each closure target says what it closes; only a venue closure reads "Closed" (ux.md S2). */
const COPY: Record<Closure["targetKind"], Copy> = {
  venue: {
    allDay: (t) => [
      t("availability.calendar.closedAllDay"),
      t("availability.calendar.closedAllDayName"),
    ],
    band: (t, v) => [
      t("availability.calendar.closedBand", v),
      t("availability.calendar.closedBandName", v),
    ],
  },
  booking: bookingCopy(""),
  service: {
    allDay: (t) => [
      t("availability.calendar.serviceClosedAllDay"),
      t("availability.calendar.serviceClosedAllDayName"),
    ],
    band: (t, v) => [
      t("availability.calendar.serviceClosedBand", v),
      t("availability.calendar.serviceClosedBandName", v),
    ],
  },
  tables: {
    allDay: (t) => [
      t("availability.calendar.tablesBlockedAllDay"),
      t("availability.calendar.tablesBlockedAllDayName"),
    ],
    band: (t, v) => [
      t("availability.calendar.tablesBlockedBand", v),
      t("availability.calendar.tablesBlockedBandName", v),
    ],
  },
};

export function closureBandText(
  closure: Closure,
  t: TFunction,
  format: VenueFormat
): ClosureBandText {
  const copy =
    closure.targetKind === "booking"
      ? bookingCopy(channelSuffix(closure))
      : COPY[closure.targetKind];
  if (isWholeDay(closure)) {
    const [text, name] = copy.allDay(t);
    return { key: closure.ruleId, text, name };
  }
  const [text, name] = copy.band(t, {
    from: minuteText(closure.from, t, format),
    to: minuteText(closure.to, t, format),
  });
  return { key: closure.ruleId, text, name };
}
