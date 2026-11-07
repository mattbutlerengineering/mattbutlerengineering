import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";

export interface DiscardChangesDialogProps {
  readonly open: boolean;
  /** The date whose draft would be lost; `null` while no drawer is open. */
  readonly date: string | null;
  /** Names the draft when it is not a day's ("Discard your changes to this schedule?"). */
  readonly title?: string;
  /** Replaces "Your unsaved changes to these hours will be lost." where more than hours would go. */
  readonly description?: string;
  /** Replaces "Discard" where the draft may already have been saved (the Close dialog). */
  readonly confirmLabel?: string;
  readonly onDiscard: () => void;
  readonly onKeepEditing: () => void;
}

/** "Discard changes to Fri Oct 30?" Focus starts on Keep editing, the safe answer. */
export function DiscardChangesDialog(props: DiscardChangesDialogProps) {
  const { open, date, title, description, confirmLabel, onDiscard, onKeepEditing } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();

  return (
    <ConfirmDialog
      open={open}
      variant="destructive"
      title={
        title ??
        t("availability.discard.title", {
          date: date
            ? format.formatCalendarDate(date, { weekday: "long", month: "long", day: "numeric" })
            : "",
        })
      }
      description={description ?? t("availability.discard.description")}
      confirmLabel={confirmLabel ?? t("availability.discard.confirm")}
      cancelLabel={t("availability.discard.keep")}
      onConfirm={onDiscard}
      onCancel={onKeepEditing}
    />
  );
}
