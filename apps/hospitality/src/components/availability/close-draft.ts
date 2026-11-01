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
  return span.weekdays === undefined || span.weekdays.length > 0;
}

/** The first field that blocks Next, or `null` when the form can be sent. */
export function validateClose(form: CloseForm, today: string): CloseField | null {
  if (!whatIsComplete(form.what)) return "what";
  if (!whenIsComplete(form.when, today)) return "when";
  if (form.guestMessage.trim().length > GUEST_MESSAGE_MAX_LENGTH) return "guestMessage";
  return null;
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
/** A scan of a long or open-ended closure stops after a year: special hours that far out are rare. */
const SPECIAL_HOURS_SCAN_DAYS = 366;

/**
 * The first date of the closure that already carries special hours, which the closure would
 * replace, or `null`. Honours the closure's range and weekdays, and a series' skipped dates.
 */
export function replacedSpecialDate(
  rules: readonly DateRule[],
  closure: Pick<DateRule, "startsOn" | "endsOn" | "repeat">
): string | null {
  const first = firstOccurrenceOnOrAfter(closure, closure.startsOn);
  if (first === null) return null;
  const last = closure.endsOn ?? addDays(first, SPECIAL_HOURS_SCAN_DAYS);
  for (let date = first, n = 0; date <= last && n <= SPECIAL_HOURS_SCAN_DAYS; n += 1) {
    const covered =
      closure.repeat == null || closure.repeat.weekdays.includes(weekdayIndexOf(date));
    if (covered && activeRules(rules, date).some((r) => r.kind === "special_hours")) return date;
    date = addDays(date, 1);
  }
  return null;
}

/**
 * The start times "Starting at" offers: every half hour of the day, then, when the day's last
 * service runs past midnight, the half hours after it up to its close (shown as "next day").
 * `keep` is a time the form already holds (a series' own), which must stay selectable.
 */
export function startMinutes(
  config: AvailabilityConfig,
  timezone: string,
  date: string,
  keep: number | null
): readonly number[] {
  const { services } = resolveDay({ timezone, config }, date);
  const lastClose = services.reduce((max, s) => Math.max(max, s.closesAt), 0);
  const end = Math.max(lastClose, keep ?? 0);
  const options: number[] = [];
  // Starting at the close itself closes nothing, so the last option is the half hour before it.
  for (
    let m = 0;
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
 * The online pause in force now, whose banner offers Resume (ux.md F5 step 9). Only the shape
 * the Pause button creates counts: online, open-ended and not repeating, so Resume never deletes
 * a dated or recurring closure. A start time holds the pause back until it is reached.
 */
export function activeOnlinePause(
  rules: readonly DateRule[],
  today: string,
  nowMinute: number
): DateRule | null {
  return (
    rules.find(
      (r) =>
        r.kind === "closure" &&
        r.targetKind === "booking" &&
        (r.bookingTypes ?? []).includes("online") &&
        r.startsOn <= today &&
        (r.endsOn === null || r.endsOn === undefined) &&
        !r.repeat &&
        (!r.window || r.window.from <= nowMinute)
    ) ?? null
  );
}
