import { useTranslation } from "react-i18next";
import { Button, ConfirmDialog, Dialog } from "@mattbutlerengineering/rialto";
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
  /**
   * Offers Save beside Discard where the draft can be saved from here: the answer saves it and
   * then leaves. The owner decides what happens when the save fails (the draft stays).
   */
  readonly onSave?: () => void;
}

/** "Discard changes to Fri Oct 30?" Focus starts on Keep editing, the safe answer. */
export function DiscardChangesDialog(props: DiscardChangesDialogProps) {
  const { open, date, title, description, confirmLabel, onDiscard, onKeepEditing, onSave } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const heading =
    title ??
    t("availability.discard.title", {
      date: date
        ? format.formatCalendarDate(date, { weekday: "long", month: "long", day: "numeric" })
        : "",
    });
  const body = description ?? t("availability.discard.description");

  if (onSave) {
    return (
      <Dialog
        open={open}
        onClose={onKeepEditing}
        role="alertdialog"
        title={heading}
        description={body}
        footer={
          <>
            <Button variant="secondary" onClick={onKeepEditing}>
              {t("availability.discard.keep")}
            </Button>
            <Button variant="secondary" onClick={onDiscard}>
              {confirmLabel ?? t("availability.discard.confirm")}
            </Button>
            <Button variant="primary" onClick={onSave}>
              {t("availabilitySchedules.save")}
            </Button>
          </>
        }
      />
    );
  }

  return (
    <ConfirmDialog
      open={open}
      variant="destructive"
      title={heading}
      description={body}
      confirmLabel={confirmLabel ?? t("availability.discard.confirm")}
      cancelLabel={t("availability.discard.keep")}
      onConfirm={onDiscard}
      onCancel={onKeepEditing}
    />
  );
}
