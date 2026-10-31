import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";

export interface DiscardChangesDialogProps {
  readonly open: boolean;
  /** The date whose draft would be lost; `null` while no drawer is open. */
  readonly date: string | null;
  /** Replaces the date-based wording for a draft that is not a day's hours (the Close dialog). */
  readonly wording?: { readonly title: string; readonly description: string };
  readonly onDiscard: () => void;
  readonly onKeepEditing: () => void;
}

/** "Discard changes to Fri Oct 30?" Focus starts on Keep editing, the safe answer. */
export function DiscardChangesDialog(props: DiscardChangesDialogProps) {
  const { open, date, wording, onDiscard, onKeepEditing } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();

  return (
    <ConfirmDialog
      open={open}
      variant="destructive"
      title={
        wording?.title ??
        t("availability.discard.title", {
          date: date
            ? format.formatCalendarDate(date, { weekday: "long", month: "long", day: "numeric" })
            : "",
        })
      }
      description={wording?.description ?? t("availability.discard.description")}
      confirmLabel={t("availability.discard.confirm")}
      cancelLabel={t("availability.discard.keep")}
      onConfirm={onDiscard}
      onCancel={onKeepEditing}
    />
  );
}
