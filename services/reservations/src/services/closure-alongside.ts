import type { ClosureAlongside, DateRule } from "@mbe/types";

/**
 * What a series edit may write beside its closure (`alongside`). The closure's own scan covers
 * only the draft rule's dates, so anything else in `alongside` would change the venue's config
 * with no decision asked of the Manager. It is therefore limited to what a series edit is: the
 * one stored series is shortened or removed, and its skips and one-date edits move onto the
 * draft unchanged. Everything else is refused.
 */

export interface AlongsideIssue {
  path: string;
  code: string;
  message: string;
}

/** Drops null, undefined and empty lists, and orders keys, so two spellings of one row compare equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, canonical(v)])
  );
}

const same = (a: DateRule, b: DateRule): boolean =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

const isSeriesRow = (r: DateRule): boolean =>
  r.kind === "closure" && r.repeat != null && r.seriesId == null;

const refuse = (path: string, message: string): AlongsideIssue => ({
  path,
  code: "invalid_alongside",
  message,
});

/** The row the series keeps: the same series, ending earlier and otherwise unchanged. */
function onlyShortened(edited: DateRule, stored: DateRule): boolean {
  return (
    edited.endsOn != null &&
    (stored.endsOn == null || edited.endsOn < stored.endsOn) &&
    same({ ...edited, endsOn: stored.endsOn }, stored)
  );
}

/** A skip or one-date edit of the series, moved to the draft (or left) and otherwise unchanged. */
function onlyMoved(edited: DateRule, stored: DateRule, seriesId: string, draftId: string) {
  return (
    stored.seriesId === seriesId &&
    (edited.seriesId === seriesId || edited.seriesId === draftId) &&
    same({ ...edited, seriesId: stored.seriesId }, stored)
  );
}

/** Null when `alongside` is a series edit of one stored series for `draft`; else the first issue. */
export function checkAlongside(
  stored: readonly DateRule[],
  draft: DateRule,
  alongside: ClosureAlongside
): AlongsideIssue | null {
  const byId = new Map(stored.map((r) => [r.id, r]));
  const touched = new Set([
    ...alongside.remove,
    ...alongside.upsert
      .filter((u) => byId.has(u.id) && isSeriesRow(byId.get(u.id)!))
      .map((u) => u.id),
  ]);
  const [seriesId] = [...touched];
  const series = seriesId ? byId.get(seriesId) : undefined;
  if (touched.size !== 1 || !series || !isSeriesRow(series) || series.id === draft.id) {
    return refuse("alongside", "A series edit replaces exactly one stored repeating closure.");
  }
  if (alongside.remove.some((id) => id !== series.id)) {
    return refuse("alongside.remove", "Only the replaced series can be removed.");
  }
  for (const edited of alongside.upsert) {
    const row = byId.get(edited.id);
    const path = `alongside.upsert.${edited.id}`;
    if (!row) return refuse(path, "A series edit adds no rows beside the new series.");
    if (edited.id === series.id) {
      if (alongside.remove.length > 0 || !onlyShortened(edited, row)) {
        return refuse(path, "The replaced series can only end earlier.");
      }
    } else if (!onlyMoved(edited, row, series.id, draft.id)) {
      return refuse(path, "Only the series' own skips and edited dates move, unchanged.");
    }
  }
  return null;
}
