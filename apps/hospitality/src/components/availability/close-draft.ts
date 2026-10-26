import {
  GUEST_MESSAGE_MAX_LENGTH,
  type ClosureAction,
  type ClosureDecision,
  type ClosureImpactGroup,
  type ClosureImpactKind,
  type DateRule,
} from "@mbe/types";

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

/** The command's `decisions`; only `keep_silent` carries `acknowledged`. */
export function toDecisions(
  groups: readonly ClosureImpactGroup[],
  choices: ChoiceMap
): ClosureDecision[] {
  return groups.flatMap((g) => {
    const action = choices[g.groupKey]?.action;
    if (action === undefined) return [];
    return [
      action === "keep_silent"
        ? { groupKey: g.groupKey, action, acknowledged: true }
        : { groupKey: g.groupKey, action },
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

/** A closure that starts within 6 hours tells guests by text and email (ux.md F5 step 7). */
export function isUrgent(
  closure: { readonly startsOn: string; readonly fromMinute: number | null },
  today: string,
  nowMinute: number
): boolean {
  if (closure.startsOn < today) return true;
  const startMinute =
    (closure.startsOn === today ? 0 : MINUTES_PER_DAY) + (closure.fromMinute ?? 0);
  return startMinute - nowMinute <= URGENT_WITHIN_MINUTES;
}

/** The open online pause covering `today`, whose banner offers Resume. */
export function activeOnlinePause(rules: readonly DateRule[], today: string): DateRule | null {
  return (
    rules.find(
      (r) =>
        r.kind === "closure" &&
        r.targetKind === "booking" &&
        (r.bookingTypes ?? []).includes("online") &&
        r.startsOn <= today &&
        (r.endsOn === null || r.endsOn === undefined || r.endsOn >= today)
    ) ?? null
  );
}
