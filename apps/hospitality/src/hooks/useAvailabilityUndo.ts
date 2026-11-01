import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigSaveResult } from "@mbe/types";
import { isEditorOpen } from "../components/availability/editor-open.js";
import { revertErrorText } from "../components/availability/revert-error.js";
import { useRevertAvailabilityChange } from "./useAvailability.js";

/** How long the Undo stays on offer (ux.md § Undo: 10 s). */
const UNDO_TOAST_MS = 10_000;

/**
 * A pressed toast button goes with its toast, which would drop focus to the page. Moved before it
 * goes: back where it was when Undo was offered, else into the drawer or dialog still open. A press
 * that never took focus (Safari) leaves focus where it is.
 */
function focusOffToast(offeredFrom: Element | null) {
  const active = document.activeElement;
  if (active && active !== document.body && !active.closest("[aria-live]")) return;
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const target =
    offeredFrom instanceof HTMLElement && offeredFrom.isConnected && offeredFrom !== document.body
      ? offeredFrom
      : dialogs[dialogs.length - 1]?.querySelector<HTMLElement>("button:not([disabled])");
  target?.focus();
}

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
      const offeredFrom = document.activeElement;
      const undo = async () => {
        // An open day editor has pinned a version this revert would move on from: its own save
        // would then be refused as out of date. Ask the Manager to finish that first, and keep
        // Undo there for when they have.
        if (isEditorOpen()) {
          toast({
            title: t("availability.undo.finishFirst"),
            variant: "default",
            duration: UNDO_TOAST_MS,
            action: undoAction(),
          });
          return;
        }
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
      // One press per button: a double click must not send a second revert, which the first would
      // have made out of date.
      const undoAction = () => {
        let pressed = false;
        return {
          label: t("availability.undo.action"),
          onClick: () => {
            // Before the guard: a second click's press has put focus back on this button.
            focusOffToast(offeredFrom);
            if (pressed) return;
            pressed = true;
            void undo();
          },
        };
      };
      toast({
        title: input.title,
        variant: "success",
        duration: UNDO_TOAST_MS,
        action: undoAction(),
      });
    },
    [revert, t, toast]
  );
}
