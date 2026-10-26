import type { ReopenResult, TonightResult } from "@mbe/types";
import type { AvailabilityClient } from "@mbe/api-client";
import { AVAILABILITY_CONFIG_QUERY_KEY, AVAILABILITY_DAYS_QUERY_KEY } from "./useAvailability.js";
import { createMutationHook } from "./create-mutation-hook.js";

export type SetTonightRequest = Parameters<AvailabilityClient["setTonight"]>[1];

/** Applies one Tonight change (pause online, close early, stop a window, block tables, pacing). */
export const useSetTonight = createMutationHook<
  { venueId: string; body: SetTonightRequest },
  TonightResult
>({
  invalidateKeys: [AVAILABILITY_CONFIG_QUERY_KEY, AVAILABILITY_DAYS_QUERY_KEY],
  mutationFn: (api, { venueId, body }) => api.availability.setTonight(venueId, body),
});

/** Ends a Tonight change early (a header chip's ✕). */
export const useEndTonight = createMutationHook<{ venueId: string; ruleId: string }, ReopenResult>({
  invalidateKeys: [AVAILABILITY_CONFIG_QUERY_KEY, AVAILABILITY_DAYS_QUERY_KEY],
  mutationFn: (api, { venueId, ruleId }) => api.availability.endTonight(venueId, ruleId),
});
