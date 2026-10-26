import type {
  ClosureAlongside,
  ClosureCallListEntry,
  ClosureImpact,
  ClosureResult,
  ClosuresResult,
  ClosureSummary,
  DateRule,
  ReopenResult,
  RetryRefundsResult,
} from "@mbe/types";
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

export type PreviewClosureImpactVariables = {
  venueId: string;
  rule: DateRule;
  alongside: ClosureAlongside;
};

/**
 * The same impact, asked when a Manager saves (not on every render): a series edit that may
 * close new dates needs to know whether Step 2 is due before it picks a save path.
 */
export const usePreviewClosureImpact = createMutationHook<
  PreviewClosureImpactVariables,
  ClosureImpact
>({
  invalidateKeys: [],
  mutationFn: (api, { venueId, rule, alongside }) =>
    api.availability.getClosureImpact(venueId, rule, alongside),
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

export const CLOSURE_SUMMARIES_QUERY_KEY = "closureSummaries" as const;
export const CLOSURE_CALL_LIST_QUERY_KEY = "closureCallList" as const;

/** Sent / Rebooked / Unreachable and refund counts per closure (Special dates tab). */
export const useClosureSummaries = createQueryHook<
  ClosureSummary[] | null,
  { venueId: string | null }
>({
  key: CLOSURE_SUMMARIES_QUERY_KEY,
  fetcher: async (params, api) =>
    params?.venueId ? api.availability.listClosures(params.venueId) : null,
  getEnabled: (params) => !!params?.venueId && params.enabled !== false,
});

/** One closure's call list: guests told without a confirmed delivery or rebooking. */
export const useClosureCallList = createQueryHook<
  ClosureCallListEntry[] | null,
  { venueId: string | null; ruleId: string | null }
>({
  key: CLOSURE_CALL_LIST_QUERY_KEY,
  fetcher: async (params, api) =>
    params?.venueId && params.ruleId
      ? api.availability.closureCallList(params.venueId, params.ruleId)
      : null,
  getEnabled: (params) => !!params?.venueId && !!params.ruleId && params.enabled !== false,
});

export type RetryClosureRefundsVariables = { venueId: string; ruleId: string };

/** Re-enqueues a closure's pending / failed refunds (Manager). */
export const useRetryClosureRefunds = createMutationHook<
  RetryClosureRefundsVariables,
  RetryRefundsResult
>({
  invalidateKeys: [CLOSURE_SUMMARIES_QUERY_KEY],
  mutationFn: (api, { venueId, ruleId }) => api.availability.retryClosureRefunds(venueId, ruleId),
});

export type ReopenClosureVariables = {
  venueId: string;
  ruleId: string;
  tellCancelledGuests: boolean;
};

/** Reopens a closure (Resume on the paused-online banner; Remove on Special dates). */
export const useReopenClosure = createMutationHook<ReopenClosureVariables, ReopenResult>({
  invalidateKeys: [
    AVAILABILITY_CONFIG_QUERY_KEY,
    AVAILABILITY_DAYS_QUERY_KEY,
    CLOSURE_SUMMARIES_QUERY_KEY,
  ],
  mutationFn: (api, { venueId, ruleId, tellCancelledGuests }) =>
    api.availability.reopenClosure(venueId, ruleId, tellCancelledGuests),
});

export type PreviewClosureImpactsVariables = {
  venueId: string;
  rules: readonly DateRule[];
};

/**
 * Which bookings each draft closure would affect, asked when the Manager moves on (not on every
 * render): the Add special date sheet needs every row's answer to know whether Step 2 is due.
 * Results are in the order of `rules`.
 */
export const usePreviewClosureImpacts = createMutationHook<
  PreviewClosureImpactsVariables,
  ClosureImpact[]
>({
  invalidateKeys: [],
  mutationFn: (api, { venueId, rules }) =>
    Promise.all(rules.map((rule) => api.availability.getClosureImpact(venueId, rule))),
});

type CreateClosuresRequest = Parameters<AvailabilityClient["createClosures"]>[1];

export type CreateClosuresVariables = {
  venueId: string;
  body: CreateClosuresRequest;
  /** One key per attempt: a retry of the same attempt replays the first results. */
  idempotencyKey: string;
};

/** Saves several closures, all or none, each with its decisions. */
export const useCreateClosures = createMutationHook<CreateClosuresVariables, ClosuresResult>({
  invalidateKeys: [
    AVAILABILITY_CONFIG_QUERY_KEY,
    AVAILABILITY_DAYS_QUERY_KEY,
    CLOSURE_SUMMARIES_QUERY_KEY,
  ],
  mutationFn: (api, { venueId, body, idempotencyKey }) =>
    api.availability.createClosures(venueId, body, idempotencyKey),
});
