import {
  GUEST_MESSAGE_MAX_LENGTH,
  type ClosureAction,
  type ClosureDecision,
  type ClosureImpact,
  type DateRule,
} from "@mbe/types";
import { buildCloseRule, toDecisions, type ChoiceMap, type OutcomeCounts } from "./close-draft.js";

/**
 * The Add special date sheet's draft (ux.md F6): rows of one date each, saved together as
 * closures. A Special hours row is never saved here: it hands its one date to the day editor
 * (D5.1). No I/O and no React, so what each row becomes is pinned by `add-dates-draft.test.ts`.
 */

export type RowKind = "closed" | "hours";

export interface DateRow {
  /** React key and id seed; stable across edits. */
  readonly key: string;
  /** `""` until picked. */
  readonly date: string;
  readonly kind: RowKind;
  /** This row's message for guests; the shared one wins while `shareMessage` is on. */
  readonly message: string;
  /** What the date is, when the sheet opened on it (a holiday's name); shown in the row's legend. */
  readonly name?: string;
}

export interface AddDatesForm {
  readonly rows: readonly DateRow[];
  readonly shareMessage: boolean;
  readonly sharedMessage: string;
}

/**
 * `dateMissing` is an empty date; `date` is a date that is set but cannot be used; `hours` is a
 * Special hours row among several dates (the day editor takes one date).
 */
export type RowField = "dateMissing" | "date" | "hours" | "message";

/** DOM id of a row's field, so a failed Next or a new row can move focus to it. */
export const rowFieldId = (rowKey: string, field: "date" | "message"): string =>
  `add-date-${rowKey}-${field}`;

export const emptyRow = (key: string, date: string, name?: string): DateRow => ({
  key,
  date,
  kind: "closed",
  message: "",
  ...(name ? { name } : {}),
});

const messageOf = (form: AddDatesForm, row: DateRow): string =>
  (form.shareMessage ? form.sharedMessage : row.message).trim();

/** The first row field that blocks Next, or `null` when every row can be saved. */
export function validateRows(
  form: AddDatesForm,
  today: string
): { readonly key: string; readonly field: RowField } | null {
  const seen = new Set<string>();
  for (const row of form.rows) {
    if (row.date === "") return { key: row.key, field: "dateMissing" };
    if (row.date < today || seen.has(row.date)) return { key: row.key, field: "date" };
    seen.add(row.date);
    if (row.kind === "hours" && form.rows.length > 1) return { key: row.key, field: "hours" };
    if (row.kind === "closed" && messageOf(form, row).length > GUEST_MESSAGE_MAX_LENGTH) {
      return { key: row.key, field: "message" };
    }
  }
  return null;
}

/**
 * The closure each Closed row saves, in row order, keyed by the row so its impact can be matched:
 * a whole-day venue closure. A Special hours row saves nothing here.
 */
export function ruleItems(
  form: AddDatesForm,
  today: string,
  idFor: (rowKey: string) => string
): { readonly rowKey: string; readonly rule: DateRule }[] {
  return form.rows.flatMap((row) => {
    if (row.kind !== "closed") return [];
    const rule = buildCloseRule(
      {
        what: { kind: "venue" },
        when: { kind: "date", date: row.date },
        fromMinute: null,
        staffNote: "",
        guestMessage: messageOf(form, row),
      },
      idFor(row.key),
      today
    );
    return rule ? [{ rowKey: row.key, rule }] : [];
  });
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
