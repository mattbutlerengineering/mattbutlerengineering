import { addDays, resolveDay, weekdayIndexOf } from "@mbe/availability";
import {
  GUEST_MESSAGE_MAX_LENGTH,
  type AvailabilityConfig,
  type AvailabilityConfigChanges,
  type ClosureAction,
  type ClosureDecision,
  type ClosureImpact,
  type DateRule,
} from "@mbe/types";
import { buildCloseRule, toDecisions, type ChoiceMap, type OutcomeCounts } from "./close-draft.js";
import { buildDraftChanges, seedServices, type DraftService } from "./draft-changes.js";

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

/** The first row field that blocks Next, or `null` when every row can be saved. */
export function validateRows(
  form: AddDatesForm,
  today: string
): { readonly key: string; readonly field: RowField } | null {
  const seen = new Set<string>();
  for (const row of form.rows) {
    if (row.date === "" || row.date < today || seen.has(row.date)) {
      return { key: row.key, field: "date" };
    }
    seen.add(row.date);
    const unnamed = row.services.some((s) => s.venueServiceId === null && !s.name.trim());
    if (row.kind !== "closed" && (row.services.length === 0 || unnamed)) {
      return { key: row.key, field: "hours" };
    }
    if (messageOf(form, row).length > GUEST_MESSAGE_MAX_LENGTH) {
      return { key: row.key, field: "message" };
    }
  }
  return null;
}

/** One whole-day venue closure per Closed row, keyed by the row so its impact can be matched. */
export function closureItems(
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

/**
 * The config save for the Special hours and Same as rows: one single-date special-hours rule
 * each, carrying the row's message. `null` when no row writes hours.
 */
export function hoursChanges(
  form: AddDatesForm,
  config: AvailabilityConfig,
  makeId: () => string
): AvailabilityConfigChanges | null {
  const parts = form.rows
    .filter((row) => row.kind !== "closed")
    .map((row) => {
      const built = buildDraftChanges({
        config,
        scope: { kind: "date", date: row.date },
        services: row.services,
        makeId,
      });
      const message = messageOf(form, row);
      return {
        venueServices: built.upsert.venueServices ?? [],
        dateRules: (built.upsert.dateRules ?? []).map((rule) =>
          message ? { ...rule, guestMessage: message } : rule
        ),
      };
    });
  if (parts.length === 0) return null;
  return {
    upsert: {
      ...(parts.some((p) => p.venueServices.length > 0)
        ? { venueServices: parts.flatMap((p) => p.venueServices) }
        : {}),
      dateRules: parts.flatMap((p) => p.dateRules),
    },
    remove: {},
  };
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
