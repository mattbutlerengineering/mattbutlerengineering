import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@mattbutlerengineering/rialto";
import type { AutopilotMove } from "@mbe/types";
import { describeApiError } from "../lib/describe-api-error.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";
import { TABLES_QUERY_KEY } from "./useTables.js";
import { focusOffToast, UNDO_TOAST_MS } from "./useAvailabilityUndo.js";
import { useApiClient } from "./useApiClient.js";
import { PROPOSALS_QUERY_KEY } from "./useAutopilotProposals.js";
import { WAITLIST_QUERY_KEY } from "./useWaitlist.js";

/** `stale`: the move no longer holds, nothing was applied and the list was refreshed. */
export type ApproveOutcome = "applied" | "stale" | "failed";

type ApplyResult = "applied" | "already-seated";

/** Problem  the walk-in route answers a 409 with when its waitlist party is already seated. */
const WAITLIST_ENTRY_NOT_WAITING = "urn:mbe:problem:waitlist-entry-not-waiting";

function isWaitlistEntryNotWaiting(error: unknown): boolean {
  const details = (error as { problemDetails?: { type?: unknown } } | null)?.problemDetails;
  return details?.type === WAITLIST_ENTRY_NOT_WAITING;
}

/**
 * Applies one Autopilot move the host approved (#9493), through the same reservation and waitlist
 * routes the Timeline and Waitlist pages use; no route of its own. The move is re-checked first
 * against fresh proposals: the engine drops a move whose table is no longer free or whose party is
 * no longer waiting, so a move still in them still holds.
 *
 * A reseat offers Undo, a second move back onto the table it left (refused plainly if someone
 * has taken it since). A waitlist seating offers none: it takes the party off the waitlist, and
 * putting them back would text the guest again.
 */
export function useApproveAutopilotMove(
  venueId: string | null,
  date: string,
  onSplitFailure?: (waitlistEntryId: string) => void
) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [pendingMoveId, setPendingMoveId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    for (const key of [
      PROPOSALS_QUERY_KEY,
      RESERVATIONS_QUERY_KEY,
      TABLES_QUERY_KEY,
      WAITLIST_QUERY_KEY,
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);

  const offerUndo = useCallback(
    (move: AutopilotMove, party: string) => {
      const offeredFrom = document.activeElement;
      let pressed = false;
      const undo = async () => {
        try {
          await api.reservations.update(move.reservationId!, { tableId: move.fromTableId! });
        } catch {
          toast({
            title: t("timeline.autopilot.undoFailed", { party }),
            variant: "error",
            duration: UNDO_TOAST_MS,
          });
          return;
        }
        refresh();
        toast({
          title: t("timeline.autopilot.undoReseatDone", { party, from: move.fromTableName }),
          variant: "success",
          duration: 5000,
        });
      };
      toast({
        title: t("timeline.autopilot.reseatDone", { party, to: move.toTableName }),
        variant: "success",
        duration: UNDO_TOAST_MS,
        action: {
          label: t("timeline.autopilot.undo"),
          onClick: () => {
            focusOffToast(offeredFrom);
            // One press per offer: a double click must not move the booking twice.
            if (pressed) return;
            pressed = true;
            void undo();
          },
        },
      });
    },
    [api, refresh, t, toast]
  );

  const apply = useCallback(
    async (move: AutopilotMove, party: string, venue: string): Promise<ApplyResult> => {
      if (move.kind === "reseat" && move.reservationId) {
        await api.reservations.update(move.reservationId, { tableId: move.toTableId });
        // A booking with no known origin has nowhere to be put back to.
        if (move.fromTableId) offerUndo(move, party);
        else toast({ title: t("timeline.autopilot.reseatDone", { party, to: move.toTableName }) });
        return "applied";
      }
      if (!move.waitlistEntryId) throw new Error("Move has nothing to apply");
      try {
        await api.reservations.walkIn({
          venueId: venue,
          partySize: move.partySize,
          tableId: move.toTableId,
          // The server seats the waitlist entry in the walk-in's own transaction: no half-seated
          // party, so no second call to fail (#9606).
          waitlistEntryId: move.waitlistEntryId,
          ...(move.partyLabel ? { guestName: move.partyLabel } : {}),
        });
      } catch (error) {
        if (!isWaitlistEntryNotWaiting(error)) throw error;
        // Another device seated this party first: nothing was written here. Hold their offers in
        // this browser too, and let the caller refresh the suggestions.
        onSplitFailure?.(move.waitlistEntryId);
        toast({
          title: t("timeline.autopilot.alreadySeated", { party }),
          duration: 8000,
        });
        return "already-seated";
      }
      toast({
        title: t("timeline.autopilot.offerDone", { party, to: move.toTableName }),
        variant: "success",
        duration: 5000,
      });
      return "applied";
    },
    [api, offerUndo, onSplitFailure, t, toast]
  );

  const approve = useCallback(
    async (move: AutopilotMove): Promise<ApproveOutcome> => {
      if (!venueId) return "failed";
      const party =
        move.partyLabel ?? t("timeline.autopilot.partyFallback", { size: move.partySize });
      setPendingMoveId(move.id);
      try {
        const fresh = await api.reservations.getAutopilotProposals({ venueId, date });
        if (!fresh.moves.some((m) => m.id === move.id)) {
          refresh();
          toast({ title: t("timeline.autopilot.stale"), duration: 8000 });
          return "stale";
        }
        const result = await apply(move, party, venueId);
        refresh();
        return result === "applied" ? "applied" : "stale";
      } catch (error) {
        toast({
          title: t("timeline.autopilot.applyFailed"),
          description: describeApiError(error).detail,
          variant: "error",
          duration: 8000,
        });
        return "failed";
      } finally {
        setPendingMoveId(null);
      }
    },
    [api, apply, date, refresh, t, toast, venueId]
  );

  return { approve, pendingMoveId };
}
