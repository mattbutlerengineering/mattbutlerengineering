import { useTranslation } from "react-i18next";
import type { DateRule } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { CloseDialog, type CloseDialogProps } from "./CloseDialog.js";

export interface EditClosureDialogProps extends Omit<
  CloseDialogProps,
  "initialDate" | "series" | "editing" | "onSavedQuietly"
> {
  /** The saved one-date, range or open-ended closure, as it was read when Edit was pressed. */
  readonly rule: DateRule;
}

/**
 * Edit on a closure (ux.md F6): the Close dialog opened on the saved closure. A save that told no
 * guest anything is a config change History can revert, so it ends in an Undo toast; one that
 * told guests ends in the Close dialog's own toast, as History cannot take those back.
 */
export function EditClosureDialog({ rule, ...props }: EditClosureDialogProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const offerUndo = useAvailabilityUndo();
  const date = format.formatCalendarDate(rule.startsOn, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <CloseDialog
      {...props}
      initialDate={rule.startsOn}
      editing={rule}
      onSavedQuietly={(saved) =>
        offerUndo({
          venueId: props.venueId,
          saved,
          title: t("availability.close.edit.toast", { date }),
        })
      }
    />
  );
}
