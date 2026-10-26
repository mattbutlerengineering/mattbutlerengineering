import type { ClosureImpact, ClosureResult, DateRule, ReopenResult } from "@mbe/types";
import type { AvailabilityClient } from "@mbe/api-client";
import { AVAILABILITY_CONFIG_QUERY_KEY, AVAILABILITY_DAYS_QUERY_KEY } from "./useAvailability.js";
import { createMutationHook } from "./create-mutation-hook.js";
import { createQueryHook } from "./create-query-hook.js";

export const CLOSURE_IMPACT_QUERY_KEY = "closureImpact" as const;

/** Which future bookings a draft closure would affect (read-only; Manager). */
export const useClosureImpact = createQueryHook<
  ClosureImpact | null,
  { venueId: string | null; rule: DateRule | null }
>({
  key: CLOSURE_IMPACT_QUERY_KEY,
  fetcher: async (params, api) =>
    params?.venueId && params.rule
      ? api.availability.getClosureImpact(params.venueId, params.rule)
      : null,
  getEnabled: (params) => !!params?.venueId && !!params.rule && params.enabled !== false,
});

type CreateClosureRequest = Parameters<AvailabilityClient["createClosure"]>[1];

export type CreateClosureVariables = {
  venueId: string;
  body: CreateClosureRequest;
  /** One key per attempt: a retry of the same attempt replays the first result. */
  idempotencyKey: string;
};

/** Saves a closure with one decision per affected group. */
export const useCreateClosure = createMutationHook<CreateClosureVariables, ClosureResult>({
  invalidateKeys: [AVAILABILITY_CONFIG_QUERY_KEY, AVAILABILITY_DAYS_QUERY_KEY],
  mutationFn: (api, { venueId, body, idempotencyKey }) =>
    api.availability.createClosure(venueId, body, idempotencyKey),
});

export type ReopenClosureVariables = {
  venueId: string;
  ruleId: string;
  tellCancelledGuests: boolean;
};

/** Reopens a closure (Resume on the paused-online banner). */
export const useReopenClosure = createMutationHook<ReopenClosureVariables, ReopenResult>({
  invalidateKeys: [AVAILABILITY_CONFIG_QUERY_KEY, AVAILABILITY_DAYS_QUERY_KEY],
  mutationFn: (api, { venueId, ruleId, tellCancelledGuests }) =>
    api.availability.reopenClosure(venueId, ruleId, tellCancelledGuests),
});
