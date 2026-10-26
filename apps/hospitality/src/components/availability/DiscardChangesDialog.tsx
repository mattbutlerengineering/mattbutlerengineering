import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";

export interface DiscardChangesDialogProps {
  readonly open: boolean;
  /** The date whose draft would be lost; `null` while no drawer is open. */
  readonly date: string | null;
  readonly onDiscard: () => void;
  readonly onKeepEditing: () => void;
}

/** "Discard changes to Fri Oct 30?" Focus starts on Keep editing, the safe answer. */
export function DiscardChangesDialog(props: DiscardChangesDialogProps) {
  const { open, date, onDiscard, onKeepEditing } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();

  return (
    <ConfirmDialog
      open={open}
      variant="destructive"
      title={t("availability.discard.title", {
        date: date
          ? format.formatCalendarDate(date, { weekday: "long", month: "long", day: "numeric" })
          : "",
      })}
      description={t("availability.discard.description")}
      confirmLabel={t("availability.discard.confirm")}
      cancelLabel={t("availability.discard.keep")}
      onConfirm={onDiscard}
      onCancel={onKeepEditing}
    />
  );
}
