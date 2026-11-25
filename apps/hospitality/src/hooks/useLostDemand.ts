import type { LostDemand } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";

export interface UseLostDemandParams {
  venueId: string;
}

/** Turned-away searches for the last 28 days; the server's window ends today in the venue's own time zone. */
export const useLostDemand = createQueryHook<LostDemand | null, UseLostDemandParams>({
  key: "lost-demand",
  fetcher: async (params, api) => {
    if (!params) return null;
    return api.reservations.getLostDemand({ venueId: params.venueId });
  },
  getEnabled: (params) => Boolean(params?.venueId),
});
