import type { TFunction } from "i18next";
import {
  activeRules,
  firstOccurrenceOnOrAfter,
  resolveDay,
  weekdayIndexOf,
} from "@mbe/availability";
import {
  GUEST_MESSAGE_MAX_LENGTH,
  type ClosureAction,
  type ClosureDecision,
  type ClosureImpactGroup,
  type AvailabilityConfig,
  type ClosureImpactKind,
  type DateRule,
} from "@mbe/types";
import { addDays } from "../../utils/service-day.js";
import { onlineSeatingLeft } from "./online-seatings.js";

/** Channels a booking-only closure can close. */
export type BookingChannel = "online" | "phone" | "waitlist";

export type CloseWhat =
  | { readonly kind: "venue" }
  | { readonly kind: "service"; readonly serviceId: string }
  | { readonly kind: "booking"; readonly types: readonly BookingChannel[] };

export type CloseWhen =
  | { readonly kind: "tonight" }
  | { readonly kind: "date"; readonly date: string }
  | { readonly kind: "range"; readonly from: string; readonly to: string }
  | {
      readonly kind: "repeats";
      readonly weekdays: readonly number[];
      readonly from: string;
      readonly to: string;
    }
  | { readonly kind: "until-reopen"; readonly from: string };

/** Step 1 of the Close dialog (ux.md S6). */
export interface CloseForm {
  readonly what: CloseWhat;
  readonly when: CloseWhen;
  /** Minute of the service day the closure starts; `null` closes all day. */
  readonly fromMinute: number | null;
  readonly staffNote: string;
  readonly guestMessage: string;
}

export type CloseField = "what" | "when" | "guestMessage";

/** What the Manager chose for one impact group. */
export interface GroupChoice {
  readonly action?: ClosureAction;
  readonly acknowledged: boolean;
}
export type ChoiceMap = Readonly<Record<string, GroupChoice>>;
export type OutcomeCounts = Readonly<Record<ClosureAction, number>>;

/** A whole-day closure is stored as 0 to two days of minutes (ADR-029). */
const END_OF_SERVICE_DAY = 2880;
const URGENT_WITHIN_MINUTES = 6 * 60;
const MINUTES_PER_DAY = 1440;

interface Span {
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly weekdays?: readonly number[];
}

function spanOf(when: CloseWhen, today: string): Span {
  switch (when.kind) {
    case "tonight":
      return { startsOn: today, endsOn: today };
    case "date":
      return { startsOn: when.date, endsOn: when.date };
    case "range":
      return { startsOn: when.from, endsOn: when.to };
    case "repeats":
      return { startsOn: when.from, endsOn: when.to, weekdays: when.weekdays };
    case "until-reopen":
      return { startsOn: when.from, endsOn: null };
  }
}

function whatIsComplete(what: CloseWhat): boolean {
  if (what.kind === "service") return what.serviceId !== "";
  if (what.kind === "booking") return what.types.length > 0;
  return true;
}

function whenIsComplete(when: CloseWhen, today: string): boolean {
  const span = spanOf(when, today);
  if (span.startsOn === "") return false;
  if (span.endsOn !== null && (span.endsOn === "" || span.endsOn < span.startsOn)) return false;
  // A repeat with no day picked, or none in its range, would save and close nothing.
  return guestDateOf(when, today) !== null;
}

/** The first field that blocks Next, or `null` when the form can be sent. */
export function validateClose(form: CloseForm, today: string): CloseField | null {
  if (!whatIsComplete(form.what)) return "what";
  if (!whenIsComplete(form.when, today)) return "when";
  if (form.guestMessage.trim().length > GUEST_MESSAGE_MAX_LENGTH) return "guestMessage";
  return null;
}

/** The DOM id of what `focusCloseField` looks for: the control, or a block that holds it. */
export const closeFieldId = (field: CloseField) => `close-field-${field}`;

/**
 * The "when" id goes on the block at fault: a repeat whose dates are in order can only be missing
 * its days (`days`), anything else on the dates.
 */
export const closeWhenId = (when: CloseWhen, days: boolean) =>
  (when.kind === "repeats" && when.from !== "" && when.to >= when.from) === days
    ? closeFieldId("when")
    : undefined;

/** S6: "focus moves to the first" problem. Called by Next, so a second Next moves it again. */
export function focusCloseField(field: CloseField) {
  const target = document.getElementById(closeFieldId(field));
  (target?.querySelector("input") ?? target)?.focus();
}

/** The note beside a Step 2 button: that it can't be undone, and why it is off while it is. */
export function stepTwoNote(ready: boolean, t: TFunction): string {
  const irreversible = t("availability.close.step2.irreversible");
  return ready ? irreversible : `${t("availability.close.step2.blocked")} ${irreversible}`;
}

function targetOf(what: CloseWhat) {
  switch (what.kind) {
    case "venue":
      return { targetKind: "venue" as const };
    case "service":
      return { targetKind: "service" as const, venueServiceId: what.serviceId };
    case "booking":
      return { targetKind: "booking" as const, bookingTypes: [...what.types] };
  }
}

/** The closure the form describes, or `null` while it is incomplete. */
export function buildCloseRule(form: CloseForm, id: string, today: string): DateRule | null {
  if (validateClose(form, today) !== null) return null;
  const span = spanOf(form.when, today);
  const note = form.staffNote.trim();
  const message = form.guestMessage.trim();
  return {
    id,
    kind: "closure",
    ...targetOf(form.what),
    startsOn: span.startsOn,
    endsOn: span.endsOn,
    ...(span.weekdays ? { repeat: { version: 1 as const, weekdays: [...span.weekdays] } } : {}),
    window:
      form.fromMinute === null
        ? null
        : { version: 1 as const, from: form.fromMinute, to: END_OF_SERVICE_DAY },
    ...(note ? { staffNote: note } : {}),
    ...(message ? { guestMessage: message } : {}),
  };
}

const HALF_HOUR = 30;
/** A scan of a long or open-ended closure stops after a year: hours that differ that far out are rare. */
const CLOSED_DATES_SCAN_DAYS = 366;

type ClosureSpan = Pick<DateRule, "startsOn" | "endsOn" | "repeat">;

/** The date the When fields start from, which a new choice of When carries over. */
export function firstDateOf(when: CloseWhen, today: string): string {
  return spanOf(when, today).startsOn;
}

/**
 * The date "Guests will see" names: a repeat's From date may not be one of its days, and with no
 * day picked, or none in its range, it closes nothing and this is `null`.
 */
export function guestDateOf(when: CloseWhen, today: string): string | null {
  const { startsOn, endsOn, weekdays } = spanOf(when, today);
  if (!weekdays || !startsOn) return startsOn;
  const repeat = { version: 1 as const, weekdays: [...weekdays] };
  return firstOccurrenceOnOrAfter({ startsOn, endsOn, repeat }, startsOn);
}

/** Every date a closure covers, in order, honouring its range and weekdays. */
export function closedDates(closure: ClosureSpan): readonly string[] {
  const first = firstOccurrenceOnOrAfter(closure, closure.startsOn);
  if (first === null) return [];
  const last = closure.endsOn ?? addDays(first, CLOSED_DATES_SCAN_DAYS);
  const dates: string[] = [];
  for (let date = first, n = 0; date <= last && n <= CLOSED_DATES_SCAN_DAYS; n += 1) {
    if (closure.repeat == null || closure.repeat.weekdays.includes(weekdayIndexOf(date))) {
      dates.push(date);
    }
    date = addDays(date, 1);
  }
  return dates;
}

/**
 * The first date of the closure that already carries special hours, which the closure would
 * replace, or `null`. Honours the closure's range and weekdays, and a series' skipped dates.
 */
export function replacedSpecialDate(
  rules: readonly DateRule[],
  closure: ClosureSpan
): string | null {
  const replaced = closedDates(closure).find((date) =>
    activeRules(rules, date).some((r) => r.kind === "special_hours")
  );
  return replaced ?? null;
}

/** When the last of these services closes, in minutes of its service day; 0 with none. */
const lastCloseOf = (services: readonly { readonly closesAt: number }[]): number =>
  services.reduce((max, s) => Math.max(max, s.closesAt), 0);

/**
 * One date per kind of day: its weekday, the assignments in season and the rules active decide its
 * hours. A year holds few kinds, and the times are worked out on every render of the dialog.
 */
function distinctDays(config: AvailabilityConfig, dates: readonly string[]): readonly string[] {
  const kinds = new Map<string, string>();
  for (const date of dates) {
    const season = config.assignments.filter(
      (a) => (a.startsOn ?? date) <= date && date <= (a.endsOn ?? date)
    );
    const ids = [...season, ...activeRules(config.dateRules, date)].map((row) => row.id);
    kinds.set(`${weekdayIndexOf(date)}:${ids.join()}`, date);
  }
  return [...kinds.values()];
}

/**
 * The start times "Starting at" offers across `dates`: every half hour of the day. When any of
 * them runs past midnight, the half hours after it up to its close (shown as "next day"), and none
 * before the earliest opening: a plain "1:00 AM" reads as after midnight but closes that whole
 * evening. `keep` is a time the form already holds (a series' own), which must stay selectable.
 */
export function startMinutes(
  config: AvailabilityConfig,
  timezone: string,
  dates: readonly string[],
  keep: number | null
): readonly number[] {
  const services = distinctDays(config, dates).flatMap(
    (date) => resolveDay({ timezone, config }, date).services
  );
  const lastClose = lastCloseOf(services);
  const end = Math.max(lastClose, keep ?? 0);
  const firstOpen = services.reduce((min, s) => Math.min(min, s.opensAt), MINUTES_PER_DAY);
  const first = lastClose > MINUTES_PER_DAY ? firstOpen - (firstOpen % HALF_HOUR) : 0;
  const options: number[] = [];
  // Starting at the close itself closes nothing, so the last option is the half hour before it.
  for (
    let m = first;
    m < Math.min(Math.max(end, MINUTES_PER_DAY), END_OF_SERVICE_DAY);
    m += HALF_HOUR
  ) {
    options.push(m);
  }
  return keep !== null && !options.includes(keep)
    ? [...options, keep].sort((a, b) => a - b)
    : options;
}

/**
 * `next` after an edit of `prev`. A new When can cover a day that runs past midnight, where a time
 * before the first opening is not offered: plain "1:00 AM" reads as after midnight but closes each
 * whole evening. That is what All day says, so the form says it. A time held while When stays as
 * it is (a series' own) is left alone.
 */
export function settleStartMinute(
  prev: CloseForm,
  next: CloseForm,
  config: AvailabilityConfig,
  timezone: string,
  today: string
): CloseForm {
  if (next.when === prev.when || next.fromMinute === null) return next;
  if (!whenIsComplete(next.when, today)) return next;
  const { startsOn, endsOn, weekdays } = spanOf(next.when, today);
  const repeat = weekdays ? { version: 1 as const, weekdays: [...weekdays] } : null;
  const [first = 0] = startMinutes(
    config,
    timezone,
    closedDates({ startsOn, endsOn, repeat }),
    null
  );
  return next.fromMinute < first ? { ...next, fromMinute: null } : next;
}

function whatOf(series: DateRule): CloseWhat {
  if (series.targetKind === "service" && series.venueServiceId) {
    return { kind: "service", serviceId: series.venueServiceId };
  }
  if (series.targetKind === "booking" && series.bookingTypes?.length) {
    return { kind: "booking", types: [...series.bookingTypes] };
  }
  return { kind: "venue" };
}

/** The form for editing one date of `series`: the series' target and start time, on that date. */
export function seriesForm(series: DateRule, date: string): CloseForm {
  return {
    what: whatOf(series),
    when: { kind: "date", date },
    fromMinute: series.window?.from ?? null,
    staffNote: "",
    guestMessage: "",
  };
}

/**
 * An edit of one date of a series. The engine applies a rule with a `seriesId` on its start date
 * only, so the rule is pinned to that single date whatever the form says.
 */
export function inSeries(rule: DateRule | null, series: DateRule | undefined): DateRule | null {
  if (!rule || !series) return rule;
  return { ...rule, seriesId: series.id, endsOn: rule.startsOn, repeat: null };
}

/**
 * Whether two forms ask the same thing of the bookings: what, when and the start time. The
 * impact query and the decisions depend on these alone; the notes and the guest message are
 * words, so editing them leaves the Manager's choices valid (and a retry the same request).
 */
export function sameRequest(a: CloseForm, b: CloseForm): boolean {
  const key = (f: CloseForm) => JSON.stringify([f.what, f.when, f.fromMinute]);
  return key(a) === key(b);
}

/** The options for one group: a shortened service can move bookings, a closed one cannot. */
export function actionsFor(kind: ClosureImpactKind): readonly ClosureAction[] {
  return kind === "shortened"
    ? ["cancel", "move", "keep_notify", "keep_silent"]
    : ["cancel", "keep_notify", "keep_silent"];
}

/** Every group has a choice, and keeping silent carries its acknowledgement. */
export function decisionsReady(groups: readonly ClosureImpactGroup[], choices: ChoiceMap): boolean {
  return groups.every((g) => {
    const choice = choices[g.groupKey];
    return choice?.action !== undefined && (choice.action !== "keep_silent" || choice.acknowledged);
  });
}

/**
 * The command's `decisions`; only `keep_silent` carries `acknowledged`. Each names the bookings
 * it was made on, so the server can tell when the group changed before the save.
 */
export function toDecisions(
  groups: readonly ClosureImpactGroup[],
  choices: ChoiceMap
): ClosureDecision[] {
  return groups.flatMap((g) => {
    const action = choices[g.groupKey]?.action;
    if (action === undefined) return [];
    const reservationIds = g.reservations.map((r) => r.id);
    return [
      action === "keep_silent"
        ? { groupKey: g.groupKey, action, acknowledged: true, reservationIds }
        : { groupKey: g.groupKey, action, reservationIds },
    ];
  });
}

/** Bookings per chosen outcome, for the button that names the result. */
export function outcomeCounts(
  groups: readonly ClosureImpactGroup[],
  choices: ChoiceMap
): OutcomeCounts {
  const counts: Record<ClosureAction, number> = {
    cancel: 0,
    move: 0,
    keep_notify: 0,
    keep_silent: 0,
  };
  for (const g of groups) {
    const action = choices[g.groupKey]?.action;
    if (action !== undefined) counts[action] += g.reservations.length;
  }
  return counts;
}

/**
 * A closure that starts within 6 hours tells guests by text and email (ux.md F5 step 7).
 * "Starts" is its next occurrence from today (honouring `endsOn` and `repeat`), not its
 * stored `startsOn` — the same rule the server applies when it decides which channels to use.
 */
export function isUrgent(
  closure: {
    readonly startsOn: string;
    readonly endsOn?: string | null;
    readonly repeat?: { readonly weekdays: readonly number[] } | null;
    readonly fromMinute: number | null;
  },
  today: string,
  nowMinute: number
): boolean {
  const startsOn = firstOccurrenceOnOrAfter(closure, today);
  if (startsOn === null) return false;
  // Two or more days out is never within 6 hours, whatever the time now.
  if (startsOn > addDays(today, 1)) return false;
  const startMinute = (startsOn === today ? 0 : MINUTES_PER_DAY) + (closure.fromMinute ?? 0);
  return startMinute - nowMinute <= URGENT_WITHIN_MINUTES;
}

/**
 * Whether a pause is what guests meet now. Its time is a seating minute of each service day, so a
 * pause from 6:00 PM leaves earlier seatings bookable. It holds once its time has been reached, or
 * while yesterday's service runs past midnight into it, and also once windowed online closures
 * (this pause, alone or with others) have taken the last online seating left today, because a
 * Manager must not read "open" when guests cannot book online. A day with no online seating of its
 * own, or a venue closed all day, is not a pause's doing. `today` and `nowMinute` are the venue's
 * civil date and minute.
 */
export function isPauseInForce(
  rule: DateRule,
  config: AvailabilityConfig,
  timezone: string,
  today: string,
  nowMinute: number
): boolean {
  if (!rule.window || rule.window.from <= nowMinute) return true;
  const yesterdayMinute = nowMinute + MINUTES_PER_DAY;
  if (
    rule.startsOn < today &&
    rule.window.from <= yesterdayMinute &&
    yesterdayMinute < lastCloseOf(resolveDay({ timezone, config }, addDays(today, -1)).services)
  ) {
    return true;
  }
  const isWindowedOnlineClosure = (r: DateRule) =>
    r.kind === "closure" &&
    r.targetKind === "booking" &&
    (r.bookingTypes ?? []).includes("online") &&
    r.window != null;
  const without = {
    ...config,
    dateRules: config.dateRules.filter((r) => !isWindowedOnlineClosure(r)),
  };
  return (
    onlineSeatingLeft(without, timezone, today, nowMinute) &&
    !onlineSeatingLeft(config, timezone, today, nowMinute)
  );
}

/**
 * The online pause the banner shows, with its Resume (ux.md F5 step 9): one in force if there is
 * one, else the earliest waiting for its time, which says so (`isPauseInForce`) and can still be
 * removed. Only the shape the Pause button creates counts: online, open-ended and not repeating,
 * so Resume never deletes a dated or recurring closure.
 */
export function shownOnlinePause(
  config: AvailabilityConfig,
  timezone: string,
  today: string,
  nowMinute: number
): DateRule | null {
  const pauses = config.dateRules.filter(
    (r) =>
      r.kind === "closure" &&
      r.targetKind === "booking" &&
      (r.bookingTypes ?? []).includes("online") &&
      r.startsOn <= today &&
      (r.endsOn === null || r.endsOn === undefined) &&
      !r.repeat
  );
  const earliest = [...pauses].sort((a, b) => (a.window?.from ?? 0) - (b.window?.from ?? 0))[0];
  return (
    pauses.find((r) => isPauseInForce(r, config, timezone, today, nowMinute)) ?? earliest ?? null
  );
}
