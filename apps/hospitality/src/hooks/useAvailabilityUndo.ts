import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigSaveResult } from "@mbe/types";
import { revertErrorText } from "../components/availability/revert-error.js";
import { useRevertAvailabilityChange } from "./useAvailability.js";

/** How long the Undo stays on offer (ux.md § Undo: 10 s). */
export const UNDO_TOAST_MS = 10_000;

/**
 * The undo toast after a save: `offerUndo` shows "<what happened> · Undo", and Undo reverts
 * that one save against the version it produced. A save that told guests something is never
 * offered here; the server would refuse it with `guests-notified` anyway.
 */
export function useAvailabilityUndo() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const revert = useRevertAvailabilityChange();

  return useCallback(
    (input: { venueId: string; title: string; saved: AvailabilityConfigSaveResult }) => {
      const undo = async () => {
        try {
          await revert.mutateAsync({
            venueId: input.venueId,
            changeId: input.saved.changeId,
            expectedVersion: input.saved.version,
          });
          toast({ title: t("availability.undo.done"), variant: "success", duration: 5000 });
        } catch (error) {
          toast({ title: revertErrorText(error, t), variant: "error", duration: 8000 });
        }
      };
      toast({
        title: input.title,
        variant: "success",
        duration: UNDO_TOAST_MS,
        action: { label: t("availability.undo.action"), onClick: () => void undo() },
      });
    },
    [revert, t, toast]
  );
}
