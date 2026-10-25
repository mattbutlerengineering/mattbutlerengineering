import type { AvailabilityConfigState, AvailabilityDaySummary } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";

export const AVAILABILITY_DAYS_QUERY_KEY = "availabilityDays" as const;
export const AVAILABILITY_CONFIG_QUERY_KEY = "availabilityConfig" as const;

/** Calendar cells: one summary per service date from `from` to `to` (<= 62 days). */
export const useAvailabilityDays = createQueryHook<
  AvailabilityDaySummary[] | null,
  { venueId: string | null; from: string; to: string }
>({
  key: AVAILABILITY_DAYS_QUERY_KEY,
  fetcher: async (params, api) =>
    params?.venueId
      ? api.availability.listDays(params.venueId, { from: params.from, to: params.to })
      : null,
  getEnabled: (params) => !!params?.venueId && params.enabled !== false,
});

/** The config the day drawer resolves "Why this day" against. */
export const useAvailabilityConfig = createQueryHook<
  AvailabilityConfigState | null,
  { venueId: string | null }
>({
  key: AVAILABILITY_CONFIG_QUERY_KEY,
  fetcher: async (params, api) =>
    params?.venueId ? api.availability.getConfig(params.venueId) : null,
  getEnabled: (params) => !!params?.venueId && params.enabled !== false,
});
