import type { EndOfServiceSummary } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";

export interface UseEndOfServiceParams {
  venueId: string;
  /** The service date to read (YYYY-MM-DD). Always passed: the server's own default trails after midnight. */
  date: string;
}

export const useEndOfService = createQueryHook<EndOfServiceSummary | null, UseEndOfServiceParams>({
  key: "end-of-service",
  fetcher: async (params, api) => {
    if (!params) return null;
    return api.reservations.getEndOfServiceSummary({ venueId: params.venueId, date: params.date });
  },
  getEnabled: (params) => Boolean(params?.date && params?.venueId),
});
