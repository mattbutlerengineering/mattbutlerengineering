import { useEffect, useRef, useState } from "react";
import type { Guest } from "@mbe/types";
import { useGuestSearch } from "./useGuests.js";

/** Typing fewer characters than this never searches (ux.md § Field). */
const MIN_CHARS = 2;
/** The pause after the last keystroke before the search runs (ux.md: "300 ms later"). */
const DEBOUNCE_MS = 300;
/** Rows shown; a further match becomes the "keep typing" status row instead. */
const MAX_ROWS = 6;

export interface UseGuestLookupParams {
  venueId: string | null | undefined;
  /** The field's current text, straight from the form (`watch("guestName")`). */
  text: string;
}

export interface UseGuestLookupResult {
  /** At most six matches for `query`. */
  rows: Guest[];
  /** A seventh match exists — the Host should keep typing to narrow. */
  hasMore: boolean;
  /** The search for `query` is in flight (never during the pause itself). */
  isLoading: boolean;
  /** The search for `query` errored; the next keystroke retries by changing the key. */
  failed: boolean;
  /** The text the rows answer, or "" while under the minimum. During the pause it is the previous settled text. */
  query: string;
  /** The Host has typed past `query`: the rows are the previous answer, kept on screen until the new one lands. */
  stale: boolean;
}

/**
 * Turns typed text into listbox rows: a 2-character minimum, a 300 ms pause, then
 * `useGuestSearch`. The pause is a timer in a ref re-armed on every text change; the effect body
 * sets no state — only the timer callback does, once the Host has stopped typing. `query` is the
 * last settled text, so the previous rows stay on screen (flagged `stale`) during the pause rather
 * than blanking on every keystroke; it clears the moment the text drops under the minimum.
 */
export function useGuestLookup({ venueId, text }: UseGuestLookupParams): UseGuestLookupResult {
  const trimmed = text.trim();
  const eligible = trimmed.length >= MIN_CHARS;
  const [settled, setSettled] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!eligible) return;
    timerRef.current = setTimeout(() => setSettled(trimmed), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [trimmed, eligible]);

  // Forget the settled text under the minimum (derived during render — no setState in an effect),
  // so an old answer can never resurface as stale rows for an unrelated search.
  if (!eligible && settled !== "") setSettled("");

  const query = eligible ? settled : "";
  const { data, isLoading, error } = useGuestSearch({ venueId, query, enabled: query !== "" });
  const matches = query !== "" ? (data?.data ?? []) : [];

  return {
    rows: matches.slice(0, MAX_ROWS),
    hasMore: matches.length > MAX_ROWS,
    isLoading: query !== "" && isLoading,
    failed: query !== "" && error !== null,
    query,
    stale: query !== "" && query !== trimmed,
  };
}
