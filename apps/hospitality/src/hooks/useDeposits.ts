import type { Deposit } from "@mbe/types";
import type { CreateDepositRequest } from "@mbe/api-client";
import { createMutationHook } from "./create-mutation-hook.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";

/* ── useCreateDeposit mutation ───────────────────────── */

/**
 * Collect (create) a deposit for a reservation through the typed `api.deposits`
 * resource, then invalidate the timeline's reservation query so sibling views
 * (the timeline grid, staff dialogs) re-read and surface the new deposit — the
 * same cache-invalidation contract every other timeline write follows.
 */
export const useCreateDeposit = createMutationHook<CreateDepositRequest, Deposit>({
  invalidateKeys: RESERVATIONS_QUERY_KEY,
  mutationFn: (api, data) => api.deposits.create(data),
});
