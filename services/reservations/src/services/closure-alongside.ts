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

/**
 * The free-text fields a row may leave out. The route's Ajv coerces a `null` here to `""` (its
 * schema is a string-then-null `anyOf`), so a stored row with no message (`null`) and the same row
 * after a round trip through the request (`""`) must read as one.
 */
const OPTIONAL_TEXT = new Set(["guestMessage", "staffNote"]);

/**
 * Drops null, undefined, empty lists and empty optional text, and orders keys, so two spellings of
 * one row compare equal.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([k, v]) =>
          v != null && !(Array.isArray(v) && v.length === 0) && !(OPTIONAL_TEXT.has(k) && v === "")
      )
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

/**
 * Whether a remove-path series edit was built from a series that has since changed. Call it after
 * `checkAlongside` accepted `alongside`. Two things make it stale, whatever the client sent:
 * the series has a skip or one-date edit the plan does not move (a teammate added it, and it would
 * be left pointing at the removed series), or the stored row is no longer the one the draft came
 * from. That row is `replaces`; a client from before the field sends none, so the draft is all
 * there is to compare: it must equal the stored series apart from the fields an edit sets (`id`,
 * `startsOn`, `endsOn`, `repeat`). That catches a changed guest message or payload, but not changed
 * weekdays or end date.
 */
export function seriesChangedSinceRead(
  stored: readonly DateRule[],
  draft: DateRule,
  alongside: ClosureAlongside
): boolean {
  const [seriesId] = alongside.remove;
  const series = stored.find((r) => r.id === seriesId);
  if (!series) return false;
  const moved = new Set(alongside.upsert.map((r) => r.id));
  if (stored.some((r) => r.seriesId === series.id && !moved.has(r.id))) return true;
  if (alongside.replaces) return !same(alongside.replaces, series);
  const { id, startsOn, endsOn, repeat } = series;
  return !same({ ...draft, id, startsOn, endsOn, repeat }, series);
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
