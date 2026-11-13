import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigChanges, PreviewScope, ScopeConflictMode } from "@mbe/types";
import { AvailabilityGuestPreview } from "./AvailabilityGuestPreview.js";

/**
 * A `makeId` for a draft that is only being previewed: ids that are stable for one build, so the
 * same draft always makes the same request body (the preview is keyed by it), and never saved.
 */
export function previewIds(): () => string {
  let n = 0;
  return () => `preview-${n++}`;
}

/**
 * Why there is nothing to preview yet, when the draft has dates but no changes to send. `quiet`:
 * the draft is unfinished and the form has not said so yet, so the preview says nothing either.
 */
export type DraftIdle = "untouched" | "fields" | "conflict" | "quiet";

export interface DraftPreviewProps {
  readonly venueId: string;
  /** The row operations a save would send, or `null` while there is nothing to save yet. */
  readonly changes: AvailabilityConfigChanges | null;
  readonly scopeConflicts: ScopeConflictMode;
  /** Every service date the change reaches: the date strip, and the stranded check unless `scope`. */
  readonly dates: readonly string[];
  /** The stranded check's own scope, when a list of `dates` cannot name what a save checks. */
  readonly scope?: PreviewScope;
  /** The version the draft was built on; a result for a later one is flagged. */
  readonly baseVersion: number;
  /** Editing is held until the newest hours load: the preview and its actions wait too. */
  readonly held?: boolean;
  /** What to say while `changes` is `null`. */
  readonly idle?: DraftIdle;
  /** The sentence for `idle === "fields"` when there is a more specific reason than a blank
   * field (an overlap, named) and no field is actually empty; the generic message otherwise. */
  readonly fieldsReason?: string | null;
  /** False for a flow whose Save has no review step, so the moved-hours note does not promise one. */
  readonly reviewOnSave?: boolean;
  /** The date to open on when the change reaches it (the weekday being edited); else the first. */
  readonly focusDate?: string;
}

interface Kept {
  readonly key: string;
  readonly changes: AvailabilityConfigChanges;
  readonly scopeConflicts: ScopeConflictMode;
  readonly dates: readonly string[];
  readonly scope: PreviewScope | undefined;
}

/**
 * The guest preview and stranded list for a schedule-level draft (ux.md F-UW.2, F3.2, F-X.3),
 * shared by Change regular week, the schedule editor, Compare services and Use schedule. It is
 * advice: a failed or slow preview never blocks Save, and the save stays the guard.
 *
 * Once shown it stays mounted, paused, while the draft cannot be previewed (a field blanked, a
 * conflict to review), so the party and compare choices the Manager made survive; the reason is
 * said above the last result, which stays dimmed.
 */
export function DraftPreview(props: DraftPreviewProps) {
  const { venueId, changes, scopeConflicts, dates, scope, baseVersion } = props;
  const { held = false, idle = "untouched", reviewOnSave = true, focusDate } = props;
  const { fieldsReason = null } = props;
  const { t } = useTranslation();
  const [kept, setKept] = useState<Kept | null>(null);
  const active = changes !== null && dates.length > 0;
  if (active) {
    const key = JSON.stringify([changes, scopeConflicts, dates, scope]);
    if (key !== kept?.key) {
      setKept({ key, changes, scopeConflicts, dates: [...dates].sort(), scope });
    }
  }
  // A draft that is back to no change (saved, discarded, reverted) leaves nothing to keep.
  if (!active && changes === null && idle === "untouched" && kept) setKept(null);
  // Editing is held, so there is no draft to show; the hold's own line says why.
  if (held) return null;
  const reason = active ? null : changes !== null ? "noDates" : idle === "quiet" ? null : idle;
  return (
    <>
      {reason && (
        <Text variant="caption" color="secondary" role="status">
          {reason === "fields" && fieldsReason
            ? fieldsReason
            : t(`availability.preview.${reason === "untouched" ? "empty" : reason}`)}
        </Text>
      )}
      {kept && (active || idle !== "untouched" || changes !== null) && (
        <AvailabilityGuestPreview
          venueId={venueId}
          changes={kept.changes}
          scopeConflicts={kept.scopeConflicts}
          dates={kept.dates}
          scope={kept.scope}
          focusDate={
            focusDate && kept.dates.includes(focusDate) ? focusDate : (kept.dates[0] as string)
          }
          baseVersion={baseVersion}
          paused={!active}
          reviewOnSave={reviewOnSave}
        />
      )}
    </>
  );
}
