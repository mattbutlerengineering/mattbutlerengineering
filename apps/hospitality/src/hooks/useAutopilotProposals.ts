import type { AutopilotProposals } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";

export interface UseAutopilotProposalsParams {
  venueId: string | null;
}

/** Moves Autopilot suggests for tonight. Read-only: the host decides; nothing is applied. */
export const useAutopilotProposals = createQueryHook<
  AutopilotProposals | null,
  UseAutopilotProposalsParams
>({
  key: "autopilot-proposals",
  fetcher: async (params, api) => {
    if (!params?.venueId) return null;
    return api.reservations.getAutopilotProposals({ venueId: params.venueId });
  },
  getEnabled: (params) => Boolean(params?.venueId),
});
