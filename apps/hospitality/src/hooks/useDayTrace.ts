import type { DayTraceResult } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";

const DAY_TRACE_QUERY_KEY = "availabilityDayTrace" as const;

/** Every candidate time of one date for a party, with what removed each (Explain this day). */
export const useDayTrace = createQueryHook<
  DayTraceResult | null,
  { venueId: string | null; date: string | null; partySize: number }
>({
  key: DAY_TRACE_QUERY_KEY,
  fetcher: async (params, api) =>
    params?.venueId && params.date
      ? api.availability.traceDay(params.venueId, {
          date: params.date,
          partySize: params.partySize,
        })
      : null,
  getEnabled: (params) => !!params?.venueId && !!params.date,
  keepPreviousData: true,
});
