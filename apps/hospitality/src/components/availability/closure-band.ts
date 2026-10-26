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

/** Each closure target says what it closes; only a venue closure reads "Closed" (ux.md S2). */
const COPY: Record<
  Closure["targetKind"],
  {
    allDay: (t: TFunction) => readonly [text: string, name: string];
    band: (t: TFunction, v: { from: string; to: string }) => readonly [text: string, name: string];
  }
> = {
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
  booking: {
    allDay: (t) => [
      t("availability.calendar.bookingOffAllDay"),
      t("availability.calendar.bookingOffAllDayName"),
    ],
    band: (t, v) => [
      t("availability.calendar.bookingOffBand", v),
      t("availability.calendar.bookingOffBandName", v),
    ],
  },
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
  const copy = COPY[closure.targetKind];
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
