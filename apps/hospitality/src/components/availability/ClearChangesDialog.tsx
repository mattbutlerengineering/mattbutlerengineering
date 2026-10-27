import { useTranslation } from "react-i18next";
import { ConfirmDialog, useToast } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { buildClearChanges, ownSingleDateRules } from "./selection-actions.js";

export interface ClearChangesDialogProps {
  readonly open: boolean;
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly dates: readonly string[];
  readonly onClose: () => void;
  /** The change was saved; the caller drops the selection. */
  readonly onFinished: () => void;
  /** Someone else saved first: reload the config so the next try is against it. */
  readonly onStale: () => void;
}

/**
 * Clear changes (ux.md F-MS): the selected dates drop their own hours changes and follow their
 * schedule again. Asks first, then offers Undo. A refusal is a toast, since the confirmation is
 * a modal and would hide an inline alert.
 */
export function ClearChangesDialog(props: ClearChangesDialogProps) {
  const { open, venueId, state, dates, onClose, onFinished, onStale } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const offerUndo = useAvailabilityUndo();
  const { mutateAsync } = useSaveAvailabilityConfig();

  // Only dates with an own change of theirs are touched; say that number, not the selection's.
  const changing = new Set(ownSingleDateRules(state.config, dates).map((r) => r.startsOn)).size;

  const confirm = async () => {
    try {
      const saved = await mutateAsync({
        venueId,
        body: {
          expectedVersion: state.version,
          changes: buildClearChanges(state.config, dates),
          scopeConflicts: "replace",
        },
      });
      offerUndo({
        venueId,
        saved,
        title: t("availability.selection.clearDialog.saved", { count: changing }),
      });
      onFinished();
    } catch (error) {
      onStale();
      toast({ variant: "error", title: describeApiError(error).detail, duration: 8000 });
      onClose();
    }
  };

  return (
    <ConfirmDialog
      open={open}
      variant="destructive"
      title={t("availability.selection.clearDialog.title", { count: changing })}
      description={t("availability.selection.clearDialog.description")}
      confirmLabel={t("availability.selection.clearDialog.confirm")}
      cancelLabel={t("availability.selection.clearDialog.keep")}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    />
  );
}
