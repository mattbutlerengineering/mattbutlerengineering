import { useTranslation } from "react-i18next";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";
import type { SaveAttempts } from "./use-save-attempts.js";

export interface LeaveSaveDialogProps {
  readonly attempts: SaveAttempts;
  /** Replaces where to check a save that may have gone through (Tonight is not on Special dates). */
  readonly maybeSavedDescription?: string;
}

/** The question before leaving a Step 2. After a save was sent, "nothing has been closed" is false. */
export function LeaveSaveDialog({ attempts, maybeSavedDescription }: LeaveSaveDialogProps) {
  const { t } = useTranslation();
  const sent = attempts.tried.length > 0;
  return (
    <DiscardChangesDialog
      open={attempts.asking}
      date={null}
      title={
        sent
          ? t("availability.close.discard.titleMaybeSaved")
          : t("availability.close.discard.title")
      }
      description={
        sent
          ? (maybeSavedDescription ?? t("availability.close.discard.descriptionMaybeSaved"))
          : t("availability.close.discard.description")
      }
      confirmLabel={sent ? t("availability.close.discard.leave") : undefined}
      onDiscard={attempts.confirmLeave}
      onKeepEditing={attempts.keepEditing}
    />
  );
}
