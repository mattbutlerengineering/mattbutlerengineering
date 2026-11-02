import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigChanges, ScopeConflictMode } from "@mbe/types";
import { AvailabilityGuestPreview } from "./AvailabilityGuestPreview.js";

/**
 * A `makeId` for a draft that is only being previewed: ids that are stable for one build, so the
 * same draft always makes the same request body (the preview is keyed by it), and never saved.
 */
export function previewIds(): () => string {
  let n = 0;
  return () => `preview-${n++}`;
}

export interface DraftPreviewProps {
  readonly venueId: string;
  /** The row operations a save would send, or `null` while there is nothing to save yet. */
  readonly changes: AvailabilityConfigChanges | null;
  readonly scopeConflicts: ScopeConflictMode;
  /** Every service date the change reaches; the stranded check covers all of them. */
  readonly dates: readonly string[];
  /** The version the draft was built on; a result for a later one is flagged. */
  readonly baseVersion: number;
  /** Editing is held until the newest hours load: the preview and its actions wait too. */
  readonly held?: boolean;
}

/**
 * The guest preview and stranded list for a schedule-level draft (ux.md F-UW.2, F3.2, F-X.3),
 * shared by Change regular week, the schedule editor, Compare services and Use schedule. It is
 * advice: a failed or slow preview never blocks Save, and the save stays the guard.
 */
export function DraftPreview(props: DraftPreviewProps) {
  const { venueId, changes, scopeConflicts, dates, baseVersion, held = false } = props;
  const { t } = useTranslation();
  if (held) return null;
  if (!changes || dates.length === 0) {
    return (
      <Text variant="caption" color="secondary">
        {t("availability.preview.empty")}
      </Text>
    );
  }
  const sorted = [...dates].sort();
  return (
    <AvailabilityGuestPreview
      venueId={venueId}
      changes={changes}
      scopeConflicts={scopeConflicts}
      dates={sorted}
      focusDate={sorted[0] as string}
      baseVersion={baseVersion}
    />
  );
}
