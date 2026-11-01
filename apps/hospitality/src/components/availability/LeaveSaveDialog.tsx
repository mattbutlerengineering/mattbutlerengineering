import { useTranslation } from "react-i18next";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";
import type { SaveAttempts } from "./use-save-attempts.js";

export interface LeaveSaveDialogProps {
  readonly attempts: SaveAttempts;
  /** Replaces where to check a save that may have gone through (Tonight is not on Special dates). */
  readonly maybeSavedDescription?: string;
}

/** The question before leaving a Step 2. After a save with no answer, "nothing has been closed" may be false. */
export function LeaveSaveDialog({ attempts, maybeSavedDescription }: LeaveSaveDialogProps) {
  const { t } = useTranslation();
  const { maybeSaved } = attempts;
  return (
    <DiscardChangesDialog
      open={attempts.asking}
      date={null}
      title={
        maybeSaved
          ? t("availability.close.discard.titleMaybeSaved")
          : t("availability.close.discard.title")
      }
      description={
        maybeSaved
          ? (maybeSavedDescription ?? t("availability.close.discard.descriptionMaybeSaved"))
          : t("availability.close.discard.description")
      }
      confirmLabel={maybeSaved ? t("availability.close.discard.leave") : undefined}
      onDiscard={attempts.confirmLeave}
      onKeepEditing={attempts.keepEditing}
    />
  );
}
