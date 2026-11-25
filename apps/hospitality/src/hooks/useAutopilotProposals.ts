import type { AutopilotProposals } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";

export const PROPOSALS_QUERY_KEY = "autopilot-proposals";

export interface UseAutopilotProposalsParams {
  venueId: string | null;
  /** The service date the Timeline is showing; the server's own default is the calendar-aware current one. */
  date: string;
}

/** Moves Autopilot suggests for a service date. Read-only: the host decides; nothing is applied. */
export const useAutopilotProposals = createQueryHook<
  AutopilotProposals | null,
  UseAutopilotProposalsParams
>({
  key: PROPOSALS_QUERY_KEY,
  fetcher: async (params, api) => {
    if (!params?.venueId) return null;
    return api.reservations.getAutopilotProposals({ venueId: params.venueId, date: params.date });
  },
  getEnabled: (params) => Boolean(params?.venueId),
});
