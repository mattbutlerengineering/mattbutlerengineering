import { useCallback, useState } from "react";
import type { RialtoMessages } from "../../i18n/messages";
import { localToday, parseIsoDate } from "../Calendar/date-grid";
import { parseTypedDate } from "./parse-typed-date";

/** The field's display format; also what {@link parseTypedDate} reads back. */
function formatDate(iso: string | null | undefined, locale: string | undefined): string {
  const parsed = iso ? parseIsoDate(iso) : null;
  if (!parsed) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

interface Draft {
  readonly text: string;
  readonly problem: string | null;
  /** The `value` this draft was typed over; a different `value` retires it. */
  readonly forValue: string | null;
}

export interface TypedDateOptions {
  value: string | null;
  onChange: (value: string | null) => void;
  locale: string | undefined;
  min?: string;
  max?: string;
  isDateDisabled?: (isoDate: string) => boolean;
  messages: RialtoMessages;
}

export interface TypedDate {
  /** What the input shows: the text being typed, else the formatted `value`. */
  text: string;
  /** Why the last committed text was refused, or `null`. */
  problem: string | null;
  type: (text: string) => void;
  /** Read the typed text: accept it, or keep it on screen with a problem. */
  commit: () => void;
  /** Drop the typed text, e.g. after a day is picked in the calendar. */
  discard: () => void;
}

/**
 * Typed-text state for an editable DatePicker. State changes only in the
 * returned handlers; what the input shows is derived during render, so a
 * `value` set from outside replaces any text typed over the old one.
 */
export function useTypedDate({
  value,
  onChange,
  locale,
  min,
  max,
  isDateDisabled,
  messages,
}: TypedDateOptions): TypedDate {
  const [draft, setDraft] = useState<Draft | null>(null);
  const active = draft && draft.forValue === value ? draft : null;

  // Mirrors Calendar: the predicate, when given, wins over min/max.
  const refusal = (iso: string): string | null => {
    if (isDateDisabled) return isDateDisabled(iso) ? messages.dateUnavailable : null;
    if (min && iso < min) return messages.dateTooEarly(formatDate(min, locale));
    if (max && iso > max) return messages.dateTooLate(formatDate(max, locale));
    return null;
  };

  // These go straight onto the native input, so a stable identity buys nothing.
  const type = (text: string) => setDraft({ text, problem: null, forValue: value });

  const commit = () => {
    if (!active) return;
    const iso = parseTypedDate(active.text, locale, localToday());
    const empty = active.text.trim() === "";
    const problem = empty ? null : iso === null ? messages.enterDate : refusal(iso);
    const next = problem === null ? iso : null;
    // A refused date leaves no value behind, so a form cannot save the old one unseen.
    setDraft(problem === null ? null : { text: active.text, problem, forValue: null });
    if (next !== value) onChange(next);
  };

  // Stable, because DatePicker's day-select callback depends on it.
  const discard = useCallback(() => setDraft(null), []);

  return {
    text: active ? active.text : formatDate(value, locale),
    problem: active ? active.problem : null,
    type,
    commit,
    discard,
  };
}
