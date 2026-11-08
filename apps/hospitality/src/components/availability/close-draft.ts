import type { TFunction } from "i18next";
import {
  activeRules,
  expandSectionRules,
  firstOccurrenceOnOrAfter,
  resolveDay,
  weekdayIndexOf,
} from "@mbe/availability";
import {
  GUEST_MESSAGE_MAX_LENGTH,
  MAX_CLOSURE_BATCH,
  type ClosureAction,
  type ClosureAlongside,
  type ClosureDecision,
  type ClosureImpact,
  type ClosureImpactGroup,
  type ClosureImpactReservation,
  type AvailabilityConfig,
  type ClosureImpactKind,
  type DateRule,
} from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { addDays } from "../../utils/service-day.js";
import { minuteText } from "./closure-band.js";
import { onlineSeatingLeft } from "./online-seatings.js";

/** Channels a booking-only closure can close. */
export type BookingChannel = "online" | "phone" | "waitlist";

export type CloseWhat =
  | { readonly kind: "venue" }
  | { readonly kind: "service"; readonly serviceId: string }
  /** One floor-plan section: its tables as they are when the closure is saved, and then as they move (ADR-032). */
  | { readonly kind: "section"; readonly sectionId: string }
  | { readonly kind: "booking"; readonly types: readonly BookingChannel[] };

export type CloseWhen =
  | { readonly kind: "tonight" }
  | { readonly kind: "date"; readonly date: string }
  /** Several picked dates, ascending: stored as one single-date closure each (#7981). */
  | { readonly kind: "dates"; readonly dates: readonly string[] }
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
    case "dates":
      return { startsOn: when.dates[0] ?? "", endsOn: when.dates.at(-1) ?? "" };
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
  if (what.kind === "section") return what.sectionId !== "";
  if (what.kind === "booking") return what.types.length > 0;
  return true;
}

function whenIsComplete(when: CloseWhen, today: string): boolean {
  if (when.kind === "dates") return when.dates.length <= MAX_CLOSURE_BATCH && when.dates.length > 0;
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

/** Ties a Step 2 button to its note. Only one Step 2 is ever open, so one id serves them all. */
export const stepTwoNoteId = "close-step-two-note";

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
    case "section":
      return { targetKind: "tables" as const, sectionId: what.sectionId, tableIds: [] };
    case "booking":
      return { targetKind: "booking" as const, bookingTypes: [...what.types] };
  }
}

/** Each section's table ids, for a section closure's `tableIds` (see `sectionMembership`). */
type SectionMembership = ReadonlyMap<string, readonly string[]>;

/**
 * The closure the form describes, or `null` while it is incomplete. Several dates build one each:
 * see `buildCloseRules`. A section closure carries the tables `membership` gives its section.
 */
export function buildCloseRule(
  form: CloseForm,
  id: string,
  today: string,
  membership: SectionMembership = new Map()
): DateRule | null {
  if (validateClose(form, today) !== null || form.when.kind === "dates") return null;
  const span = spanOf(form.when, today);
  const note = form.staffNote.trim();
  const message = form.guestMessage.trim();
  const rule: DateRule = {
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
  return expandSectionRules([rule], membership)[0] ?? null;
}

/**
 * The closures the form describes, in date order, or none while it is incomplete. Several dates
 * are one single-date closure each (Owner decision on #7981), so Undo, History, edit and reopen
 * work per date; `idFor` names each date's rule.
 */
export function buildCloseRules(
  form: CloseForm,
  idFor: (date: string) => string,
  today: string,
  membership: SectionMembership = new Map()
): readonly DateRule[] {
  if (form.when.kind !== "dates") {
    const rule = buildCloseRule(form, idFor(firstDateOf(form.when, today)), today, membership);
    return rule ? [rule] : [];
  }
  return form.when.dates.flatMap((date) => {
    const rule = buildCloseRule(
      { ...form, when: { kind: "date", date } },
      idFor(date),
      today,
      membership
    );
    return rule ? [rule] : [];
  });
}

/** Picked dates with `date` added or removed, ascending, with no date twice. */
export function toggleDate(dates: readonly string[], date: string): readonly string[] {
  return dates.includes(date) ? dates.filter((d) => d !== date) : [...dates, date].sort();
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

/** The half hour at or before `minute`. */
const floorToHalfHour = (minute: number): number => minute - (minute % HALF_HOUR);

/** The services open on these dates: the hours a start time is chosen against. */
function servicesOn(config: AvailabilityConfig, timezone: string, dates: readonly string[]) {
  return distinctDays(config, dates).flatMap(
    (date) => resolveDay({ timezone, config }, date).services
  );
}

/**
 * The start times "Starting at" offers across `dates`: half hours from the first opening to the
 * half hour before the last close (shown as "next day" past midnight), and none before the
 * earliest opening on a day that runs past midnight: a plain "1:00 AM" reads as after midnight
 * but closes that whole evening. A date with no hours offers the whole day. `nowMinute`, passed
 * only when the one date is today, starts the list at the next half hour. `keep` is a time the
 * form already holds (a series' own), which must stay selectable.
 */
export function startMinutes(
  config: AvailabilityConfig,
  timezone: string,
  dates: readonly string[],
  keep: number | null,
  nowMinute?: number
): readonly number[] {
  const services = servicesOn(config, timezone, dates);
  const hasHours = services.length > 0;
  const firstOpen = services.reduce((min, s) => Math.min(min, s.opensAt), MINUTES_PER_DAY);
  const opening = hasHours ? floorToHalfHour(firstOpen) : 0;
  const afterNow = nowMinute === undefined ? 0 : floorToHalfHour(nowMinute) + HALF_HOUR;
  // Starting at the close itself closes nothing, so the last option is the half hour before it.
  const stop = Math.min(hasHours ? lastCloseOf(services) : MINUTES_PER_DAY, END_OF_SERVICE_DAY);
  const options: number[] = [];
  for (let m = Math.max(opening, afterNow); m < stop; m += HALF_HOUR) {
    options.push(m);
  }
  return keep !== null && !options.includes(keep)
    ? [...options, keep].sort((a, b) => a - b)
    : options;
}

/**
 * The earliest start a day that runs past midnight allows: its first opening. Any other day has
 * no floor, so a time the Manager chose before opening stays as they chose it.
 */
function overnightFloor(
  config: AvailabilityConfig,
  timezone: string,
  dates: readonly string[]
): number {
  const services = servicesOn(config, timezone, dates);
  if (lastCloseOf(services) <= MINUTES_PER_DAY) return 0;
  return floorToHalfHour(services.reduce((min, s) => Math.min(min, s.opensAt), MINUTES_PER_DAY));
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
  const dates =
    next.when.kind === "dates" ? next.when.dates : closedDates({ startsOn, endsOn, repeat });
  return next.fromMinute < overnightFloor(config, timezone, dates)
    ? { ...next, fromMinute: null }
    : next;
}

/** Step 2 follows Step 1 when bookings are affected or an edit gives dates back: what Next checks. */
export function willHaveStepTwo(
  groups: readonly ClosureImpactGroup[],
  givenBack: ClosureImpact["givenBack"]
): boolean {
  return groups.length > 0 || Boolean(givenBack);
}

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

/** The sentence after a save (ux.md F4.7): what closed, when, and how many guests were told. */
export function closeToastText(
  draft: CloseToastDraft,
  outcome: { readonly notified: number },
  t: TFunction,
  format: Pick<VenueFormat, "formatCalendarDate" | "formatLocalTime">
): string {
  const { form, count, name } = draft;
  const { what, when } = form;
  const date = format.formatCalendarDate(draft.date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const base = (): string => {
    if (when.kind === "dates") {
      if (what.kind === "booking")
        return t("availability.close.toast.manyBookingPaused", { count });
      return name
        ? t("availability.close.toast.serviceClosedMany", { name, count })
        : t("availability.close.toast.many", { count });
    }
    if (what.kind === "booking") {
      if (what.types.length === 1 && what.types[0] === "online") {
        return t("availability.close.toast.paused");
      }
      return t("availability.close.toast.bookingPausedOn", {
        channels: pausedChannels(what.types, t),
        date,
      });
    }
    if (form.fromMinute !== null) {
      const time = minuteText(form.fromMinute, t, format);
      const tonight = when.kind === "tonight";
      if (name) {
        return tonight
          ? t("availability.close.toast.serviceClosedFromTonight", { service: name, time })
          : t("availability.close.toast.serviceClosedFrom", { service: name, time, date });
      }
      return tonight
        ? t("availability.close.toast.closedFromTonight", { time })
        : t("availability.close.toast.closedFrom", { time, date });
    }
    if (name && what.kind === "section") {
      return t("availability.close.toast.closedSection", { section: name, date });
    }
    return name
      ? t("availability.close.toast.serviceClosedOn", { service: name, date })
      : t("availability.close.toast.closedOn", { date });
  };

  const sentence = base();
  return outcome.notified > 0
    ? t("availability.close.toast.withNotified", { text: sentence, count: outcome.notified })
    : sentence;
}

function whatOf(series: DateRule): CloseWhat {
  if (series.targetKind === "service" && series.venueServiceId) {
    return { kind: "service", serviceId: series.venueServiceId };
  }
  if (series.targetKind === "tables" && series.sectionId) {
    return { kind: "section", sectionId: series.sectionId };
  }
  if (series.targetKind === "booking" && series.bookingTypes?.length) {
    return { kind: "booking", types: [...series.bookingTypes] };
  }
  return { kind: "venue" };
}

/**
 * Whether the Close form can describe a saved closure and rebuild it: a one-date, range or open-
 * ended closure of the venue, a service or booking channels, all day or from a set time. A
 * repeating closure is edited as a series, and anything the form cannot say is not offered.
 */
export function isEditableClosure(rule: DateRule): boolean {
  return (
    rule.kind === "closure" &&
    rule.repeat == null &&
    rule.seriesId == null &&
    (rule.targetKind === "venue" ||
      (rule.targetKind === "service" && !!rule.venueServiceId) ||
      (rule.targetKind === "tables" && !!rule.sectionId) ||
      (rule.targetKind === "booking" && !!rule.bookingTypes?.length)) &&
    (rule.window == null || rule.window.to === END_OF_SERVICE_DAY)
  );
}

/** The form for editing the saved closure `rule`: everything it says, as the Manager set it. */
export function closureForm(rule: DateRule): CloseForm {
  const when: CloseWhen =
    rule.endsOn == null
      ? { kind: "until-reopen", from: rule.startsOn }
      : rule.endsOn === rule.startsOn
        ? { kind: "date", date: rule.startsOn }
        : { kind: "range", from: rule.startsOn, to: rule.endsOn };
  return {
    what: whatOf(rule),
    when,
    fromMinute: rule.window?.from ?? null,
    staffNote: rule.staffNote ?? "",
    guestMessage: rule.guestMessage ?? "",
  };
}

/**
 * What an edit of the saved closure `rule` sends beside the edited closure: the saved one goes,
 * and the row as it was read is named so a teammate's change since is refused, not overwritten.
 */
export function editAlongside(rule: DateRule): ClosureAlongside {
  return { upsert: [], remove: [rule.id], replaces: rule };
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

/**
 * The bookings of a group the server found no open time for (`proposedStart: null`), so a move is
 * refused while any is in it. A booking with no proposal at all (an older server) is not counted.
 */
export function unmovable(group: ClosureImpactGroup): ClosureImpactReservation[] {
  return group.reservations.filter((r) => r.proposedStart === null);
}

/** Every group has a choice, and keeping silent carries its acknowledgement. */
export function decisionsReady(groups: readonly ClosureImpactGroup[], choices: ChoiceMap): boolean {
  return groups.every((g) => {
    const choice = choices[g.groupKey];
    if (choice?.action === "move" && unmovable(g).length > 0) return false;
    return choice?.action !== undefined && (choice.action !== "keep_silent" || choice.acknowledged);
  });
}

/** The choices without those of the groups that hold any of `reservationIds`: they must be made again. */
export function withoutChoicesFor(
  groups: readonly ClosureImpactGroup[],
  choices: ChoiceMap,
  reservationIds: readonly string[]
): ChoiceMap {
  const ids = new Set(reservationIds);
  const dropped = new Set(
    groups.filter((g) => g.reservations.some((r) => ids.has(r.id))).map((g) => g.groupKey)
  );
  return Object.fromEntries(Object.entries(choices).filter(([key]) => !dropped.has(key)));
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
