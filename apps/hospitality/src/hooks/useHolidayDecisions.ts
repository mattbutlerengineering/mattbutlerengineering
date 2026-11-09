import type { HolidayDecision, HolidayDecisionKind } from "@mbe/types";
import { createMutationHook } from "./create-mutation-hook.js";
import { createQueryHook } from "./create-query-hook.js";

const HOLIDAY_DECISIONS_QUERY_KEY = "holidayDecisions" as const;

/**
 * The venue's holiday decisions from `from` to `to` (<= 400 days). Any venue member can read
 * them. Kept apart from the availability config: a decision changes nothing the engine resolves,
 * so these hooks neither track the config's own saves nor refresh the config or the days.
 */
export const useHolidayDecisions = createQueryHook<
  HolidayDecision[] | null,
  { venueId: string | null; from: string; to: string }
>({
  key: HOLIDAY_DECISIONS_QUERY_KEY,
  fetcher: async (params, api) =>
    params?.venueId
      ? api.availability.listHolidayDecisions(params.venueId, { from: params.from, to: params.to })
      : null,
  getEnabled: (params) => !!params?.venueId && params.enabled !== false,
});

/** Records an answer for one holiday (Manager only). Idempotent: a repeat returns the same row. */
export const useSetHolidayDecision = createMutationHook<
  { venueId: string; serviceDate: string; decision: HolidayDecisionKind },
  HolidayDecision
>({
  invalidateKeys: [HOLIDAY_DECISIONS_QUERY_KEY],
  mutationFn: (api, { venueId, serviceDate, decision }) =>
    api.availability.setHolidayDecision(venueId, serviceDate, decision),
});

/** Takes an answer back (Manager only). Idempotent: a date with none is still a success. */
export const useClearHolidayDecision = createMutationHook<
  { venueId: string; serviceDate: string },
  void
>({
  invalidateKeys: [HOLIDAY_DECISIONS_QUERY_KEY],
  mutationFn: (api, { venueId, serviceDate }) =>
    api.availability.clearHolidayDecision(venueId, serviceDate),
});
