import { useMemo } from "react";
import type { AutopilotMove } from "@mbe/types";
import { useAutopilotDismissals } from "./useAutopilotDismissals.js";
import { useAutopilotProposals } from "./useAutopilotProposals.js";

export interface TonightAutopilot {
  /** Suggestions still worth showing: none off tonight, after "dismiss for tonight", or on a failed read. */
  readonly moves: readonly AutopilotMove[];
  readonly dismissMove: (moveId: string) => void;
  readonly dismissNight: () => void;
}

const NONE: readonly AutopilotMove[] = [];

/**
 * Autopilot's suggestions for the Timeline: only for tonight's service date, minus what the host
 * has dismissed. A failed read shows nothing: a suggestion is never worth a banner.
 */
export function useTonightAutopilot(
  venueId: string | null,
  date: string,
  isTonight: boolean
): TonightAutopilot {
  const proposals = useAutopilotProposals({ venueId: isTonight ? venueId : null });
  const dismissals = useAutopilotDismissals(venueId ?? "", date);
  const all = proposals.data?.moves ?? NONE;
  const { nightDismissed, isMoveDismissed } = dismissals;

  const moves = useMemo(
    () => (!isTonight || nightDismissed ? NONE : all.filter((m) => !isMoveDismissed(m.id))),
    [isTonight, nightDismissed, all, isMoveDismissed]
  );

  return { moves, dismissMove: dismissals.dismissMove, dismissNight: dismissals.dismissNight };
}
