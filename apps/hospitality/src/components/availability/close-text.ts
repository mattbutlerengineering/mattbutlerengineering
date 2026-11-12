import type { TFunction } from "i18next";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { addDays } from "../../utils/service-day.js";
import { minuteText } from "./closure-band.js";
import { weekdaySummary } from "./weekday-summary.js";
import { closedDates, type BookingChannel, type CloseForm, type CloseWhen } from "./close-draft.js";

/*
 * What the Close dialog says about a closure in words: its primary button and the toast after a
 * save (feature:availability-scenario-ux ux.md F4.7, S-Close). Pure, so every What × When is
 * tested without the dialog.
 */

/** What the toast after a save is built from: the submitted form and the dates it covers. */
export interface CloseToastDraft {
  readonly form: CloseForm;
  /** The first date the closure covers (a repeat's From date may not be one of its days). */
  readonly date: string;
  /** How many closures were saved: more than one for Several dates. */
  readonly count: number;
  /** The chosen service's or section's name, when What is one. */
  readonly name: string | undefined;
}

/** "Online and phone booking": the channels a booking-only closure pauses, in the venue's words. */
function pausedChannels(types: readonly BookingChannel[], t: TFunction): string {
  const online = types.includes("online");
  const phone = types.includes("phone");
  const waitlist = types.includes("waitlist");
  if (online && phone && waitlist) return t("availability.close.toast.pausedChannels.all");
  if (online && phone) return t("availability.close.toast.pausedChannels.online_phone");
  if (online && waitlist) return t("availability.close.toast.pausedChannels.online_waitlist");
  if (phone && waitlist) return t("availability.close.toast.pausedChannels.phone_waitlist");
  if (phone) return t("availability.close.toast.pausedChannels.phone");
  if (waitlist) return t("availability.close.toast.pausedChannels.waitlist");
  return t("availability.close.toast.pausedChannels.online");
}

/** 2026-01-04 is a Sunday; a weekday index plus this date names that weekday in any locale. */
const SUNDAY = "2026-01-04";

type CloseFormat = Pick<VenueFormat, "formatCalendarDate" | "formatLocalTime" | "locale">;

const SHORT_DATE = { weekday: "short", month: "short", day: "numeric" } as const;

/**
 * Where and when a closure is, as the end of a sentence ("on Thu, Dec 24", "tonight",
 * "Thu, Dec 24 – Sat, Jan 2", "every Monday, Mon, Jan 4 – Mon, Jan 25", "from Sun, Nov 8 until you
 * reopen"). `timed` is for a sentence that already said "from 9:30 PM": the phrase then reads on.
 * `firstDate` is the first date the closure covers (a repeat's From date may not be one of its days).
 */
function whenPhrase(
  when: CloseWhen,
  timed: boolean,
  firstDate: string,
  t: TFunction,
  format: CloseFormat
): string {
  const day = (date: string) => format.formatCalendarDate(date, SHORT_DATE);
  switch (when.kind) {
    case "tonight":
      return timed
        ? t("availability.close.toast.whenTimed.tonight")
        : t("availability.close.toast.when.date", { date: day(firstDate) });
    case "date":
    case "dates":
      return t("availability.close.toast.when.date", { date: day(firstDate) });
    case "range":
      return t(
        timed ? "availability.close.toast.whenTimed.range" : "availability.close.toast.when.range",
        { from: day(when.from), to: day(when.to) }
      );
    case "repeats": {
      const last =
        closedDates({
          startsOn: when.from,
          endsOn: when.to,
          repeat: { version: 1, weekdays: [...when.weekdays] },
        }).at(-1) ?? when.to;
      // One occurrence is a date, not a series.
      if (last === firstDate) return t("availability.close.toast.when.date", { date: day(last) });
      const [only, ...more] = when.weekdays;
      const days =
        only !== undefined && more.length === 0
          ? format.formatCalendarDate(addDays(SUNDAY, only), { weekday: "long" })
          : weekdaySummary(when.weekdays, format, t);
      return t("availability.close.toast.when.repeats", {
        days,
        from: day(firstDate),
        to: day(last),
      });
    }
    case "until-reopen":
      return t(
        timed
          ? "availability.close.toast.whenTimed.untilReopen"
          : "availability.close.toast.when.untilReopen",
        { date: day(when.from) }
      );
  }
}

/**
 * What the primary says while the form is not yet a closure: the one thing still to choose. `null`
 * once the dates are complete. Never formats an empty date, so it never reads "Invalid Date" or
 * "every ,".
 */
export function closeIncompleteText(form: CloseForm, t: TFunction): string | null {
  const { when } = form;
  switch (when.kind) {
    case "tonight":
      return null;
    case "date":
      return when.date === "" ? t("availability.close.button.chooseDate") : null;
    case "dates":
      return when.dates.length === 0 ? t("availability.close.button.chooseDates") : null;
    case "until-reopen":
      return when.from === "" ? t("availability.close.button.chooseDate") : null;
    case "range":
      if (when.from === "") return t("availability.close.button.chooseDate");
      return when.to === "" || when.to < when.from
        ? t("availability.close.button.chooseEnd")
        : null;
    case "repeats": {
      if (when.from === "") return t("availability.close.button.chooseDate");
      const endMissing = when.to === "" || when.to < when.from;
      if (when.weekdays.length === 0) {
        return t(
          endMissing
            ? "availability.close.button.chooseDaysAndEnd"
            : "availability.close.button.chooseDays"
        );
      }
      if (endMissing) return t("availability.close.button.chooseEnd");
      // Days chosen, but none of them falls between From and To: nothing would close.
      return closedDates({
        startsOn: when.from,
        endsOn: when.to,
        repeat: { version: 1, weekdays: [...when.weekdays] },
      }).length === 0
        ? t("availability.close.button.chooseDays")
        : null;
    }
  }
}

/**
 * The Close button once nothing is left to decide (ux.md S-Close): what it closes, from when, and
 * on which dates. A booking-only closure has its own labels. While the dates are incomplete it
 * names what is missing instead.
 */
export function closeButtonText(
  draft: { readonly form: CloseForm; readonly date: string; readonly name: string | undefined },
  t: TFunction,
  format: CloseFormat
): string {
  const { form, name } = draft;
  const incomplete = closeIncompleteText(form, t);
  if (incomplete !== null) return incomplete;
  const { when } = form;
  const tonight = when.kind === "tonight";
  const oneDay = tonight || when.kind === "date";
  const date = format.formatCalendarDate(draft.date, SHORT_DATE);
  if (form.fromMinute !== null) {
    const time = minuteText(form.fromMinute, t, format);
    if (oneDay) {
      if (name) {
        return tonight
          ? t("availability.close.button.closeTargetFromTonight", { target: name, time })
          : t("availability.close.button.closeTargetFrom", { target: name, time, date });
      }
      return tonight
        ? t("availability.close.button.closeFromTonight", { time })
        : t("availability.close.button.closeFrom", { time, date });
    }
    const phrase = whenPhrase(when, true, draft.date, t, format);
    return name
      ? t("availability.close.button.closeTargetFromWhen", { target: name, time, when: phrase })
      : t("availability.close.button.closeFromWhen", { time, when: phrase });
  }
  if (oneDay) {
    return name
      ? t("availability.close.button.closeTarget", { target: name, date })
      : t("availability.close.button.close", { date });
  }
  const phrase = whenPhrase(when, false, draft.date, t, format);
  return name
    ? t("availability.close.button.closeTargetWhen", { target: name, when: phrase })
    : t("availability.close.button.closeWhen", { when: phrase });
}

/** How many bookings Step 2 ended each way, from the save's outcomes. */
export type ToastOutcome = Readonly<
  Record<"cancel" | "move" | "keep_notify" | "keep_silent", number>
>;

const OUTCOME_ORDER = ["cancel", "move", "keep_notify", "keep_silent"] as const;

/** The sentence after a save (ux.md F4.7): what closed, when, and what became of the bookings. */
export function closeToastText(
  draft: CloseToastDraft,
  outcome: ToastOutcome,
  t: TFunction,
  format: CloseFormat
): string {
  const { form, count, name } = draft;
  const { what, when } = form;

  const base = (): string => {
    if (when.kind === "dates") {
      if (what.kind === "booking")
        return t("availability.close.toast.manyBookingPaused", { count });
      return name
        ? t("availability.close.toast.serviceClosedMany", { name, count })
        : t("availability.close.toast.many", { count });
    }
    const timed = form.fromMinute !== null;
    const time = form.fromMinute === null ? "" : minuteText(form.fromMinute, t, format);
    const phrase = whenPhrase(when, timed, draft.date, t, format);
    if (what.kind === "booking") {
      // The pause entry's own sentence: online booking, until the Manager reopens it.
      if (
        !timed &&
        when.kind === "until-reopen" &&
        what.types.length === 1 &&
        what.types[0] === "online"
      ) {
        return t("availability.close.toast.paused");
      }
      const channels = pausedChannels(what.types, t);
      return timed
        ? t("availability.close.toast.bookingPausedFrom", { channels, time, when: phrase })
        : t("availability.close.toast.bookingPaused", { channels, when: phrase });
    }
    if (name) {
      return timed
        ? t("availability.close.toast.namedClosedFrom", { name, time, when: phrase })
        : t("availability.close.toast.namedClosed", { name, when: phrase });
    }
    return timed
      ? t("availability.close.toast.closedFrom", { time, when: phrase })
      : t("availability.close.toast.closed", { when: phrase });
  };

  const sentence = base();
  const outcomes = OUTCOME_ORDER.filter((key) => outcome[key] > 0)
    .map((key) => t(`availability.close.toast.outcome.${key}`, { count: outcome[key] }))
    .join(" · ");
  return outcomes === ""
    ? sentence
    : t("availability.close.toast.withOutcomes", { text: sentence, outcomes });
}
