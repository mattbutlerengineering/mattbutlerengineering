import { addDays, resolveDay, weekdayIndexOf } from "@mbe/availability";
import {
  GUEST_MESSAGE_MAX_LENGTH,
  type AvailabilityConfig,
  type SpecialHoursService,
  type ClosureAction,
  type ClosureDecision,
  type ClosureImpact,
  type DateRule,
} from "@mbe/types";
import { buildCloseRule, toDecisions, type ChoiceMap, type OutcomeCounts } from "./close-draft.js";
import { seedServices, type DraftService } from "./draft-changes.js";

/**
 * The Add special date sheet's draft (ux.md F6): rows of one date each, Closed, Special hours
 * or Same as a weekday, saved together. No I/O and no React, so what each row becomes is pinned
 * by `add-dates-draft.test.ts`.
 */

export type RowKind = "closed" | "hours" | "same";

export interface DateRow {
  /** React key and id seed; stable across edits. */
  readonly key: string;
  /** `""` until picked. */
  readonly date: string;
  readonly kind: RowKind;
  /** The weekday a "Same as" row copies (0 = Sunday). */
  readonly sameAs: number;
  /** The hours a Special hours or Same as row writes. */
  readonly services: readonly DraftService[];
  /** This row's message for guests; the shared one wins while `shareMessage` is on. */
  readonly message: string;
}

export interface AddDatesForm {
  readonly rows: readonly DateRow[];
  readonly shareMessage: boolean;
  readonly sharedMessage: string;
}

export type RowField = "date" | "hours" | "message";

export const emptyRow = (key: string, date: string): DateRow => ({
  key,
  date,
  kind: "closed",
  sameAs: date ? weekdayIndexOf(date) : 0,
  services: [],
  message: "",
});

const messageOf = (form: AddDatesForm, row: DateRow): string =>
  (form.shareMessage ? form.sharedMessage : row.message).trim();

/** The date already has special hours of its own, which a new row cannot replace. */
function hasOwnHours(config: AvailabilityConfig, date: string): boolean {
  return config.dateRules.some(
    (r) => r.kind === "special_hours" && r.startsOn <= date && (r.endsOn ?? date) >= date
  );
}

/** The first row field that blocks Next, or `null` when every row can be saved. */
export function validateRows(
  form: AddDatesForm,
  config: AvailabilityConfig,
  today: string
): { readonly key: string; readonly field: RowField } | null {
  const seen = new Set<string>();
  for (const row of form.rows) {
    if (
      row.date === "" ||
      row.date < today ||
      seen.has(row.date) ||
      (row.kind !== "closed" && hasOwnHours(config, row.date))
    ) {
      return { key: row.key, field: "date" };
    }
    seen.add(row.date);
    // The closure command saves a rule against the venue's existing services only.
    const unknown = row.services.some((s) => s.venueServiceId === null);
    if (row.kind !== "closed" && (row.services.length === 0 || unknown)) {
      return { key: row.key, field: "hours" };
    }
    if (messageOf(form, row).length > GUEST_MESSAGE_MAX_LENGTH) {
      return { key: row.key, field: "message" };
    }
  }
  return null;
}

/**
 * The rule each row saves, in row order, keyed by the row so its impact can be matched: a
 * whole-day venue closure for Closed, a single-date special-hours rule for the other two.
 */
export function ruleItems(
  form: AddDatesForm,
  today: string,
  idFor: (rowKey: string) => string
): { readonly rowKey: string; readonly rule: DateRule }[] {
  return form.rows.flatMap((row) => {
    const message = messageOf(form, row);
    const rule =
      row.kind === "closed"
        ? buildCloseRule(
            {
              what: { kind: "venue" },
              when: { kind: "date", date: row.date },
              fromMinute: null,
              staffNote: "",
              guestMessage: message,
            },
            idFor(row.key),
            today
          )
        : hoursRule(row, idFor(row.key), message);
    return rule ? [{ rowKey: row.key, rule }] : [];
  });
}

function hoursRule(row: DateRow, id: string, message: string): DateRule {
  const services: SpecialHoursService[] = row.services.map((s) => ({
    venueServiceId: s.venueServiceId!, // validateRows refuses a row with a new service
    opensAt: s.opensAt,
    lastSeatingAt: s.lastSeatingAt,
    closesAt: s.closesAt,
    seating: s.seating,
    bookingTypes: [...s.bookingTypes],
  }));
  return {
    id,
    kind: "special_hours",
    targetKind: "venue",
    startsOn: row.date,
    endsOn: row.date,
    payload: { version: 1, services },
    ...(message ? { guestMessage: message } : {}),
  };
}

/** The regular week's hours for a weekday, ignoring any date's own changes. */
export function regularServices(
  config: AvailabilityConfig,
  timezone: string,
  weekday: number,
  today: string
): DraftService[] {
  let date = today;
  while (weekdayIndexOf(date) !== weekday) date = addDays(date, 1);
  const regular = { ...config, dateRules: [] };
  const day = resolveDay({ timezone, config: regular }, date);
  return seedServices(regular, day, { kind: "date", date });
}

/** One impact for the combined Step 2: every row's groups by date, with the totals summed. */
export function combineImpacts(impacts: readonly ClosureImpact[]): ClosureImpact {
  const sum = (pick: (i: ClosureImpact) => number) =>
    impacts.reduce((total, i) => total + pick(i), 0);
  return {
    reservations: sum((i) => i.reservations),
    covers: sum((i) => i.covers),
    depositsHeld: sum((i) => i.depositsHeld),
    groups: impacts
      .flatMap((i) => i.groups)
      .sort((a, b) => a.date.localeCompare(b.date) || a.groupKey.localeCompare(b.groupKey)),
  };
}

/** Each row's own decisions from the one choice map, in the order of `impacts`. */
export function decisionsFor(
  impacts: readonly ClosureImpact[],
  choices: ChoiceMap
): ClosureDecision[][] {
  return impacts.map((impact) => toDecisions(impact.groups, choices));
}

/** What the Step 2 button says: how many dates, then each outcome with bookings in it. */
export function saveLabelParts(
  dates: number,
  counts: OutcomeCounts
): { dates: number; parts: { action: ClosureAction; count: number }[] } {
  const actions = ["cancel", "move", "keep_notify", "keep_silent"] as const;
  return {
    dates,
    parts: actions
      .filter((a) => counts[a] > 0)
      .map((action) => ({ action, count: counts[action] })),
  };
}
