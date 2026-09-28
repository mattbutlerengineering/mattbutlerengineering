import type { Deposit } from "@mbe/types";
import type { CreateDepositRequest } from "@mbe/api-client";
import { createQueryHook } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";

export const DEPOSITS_QUERY_KEY = "deposits" as const;

/* ── useDepositByReservation ───────────────────────────── */

/**
 * Operator visibility (#5725 item 1): reads a reservation's deposit through
 * the venue-scoped `GET /api/v1/deposits?reservationId=` route, or `null`
 * when the reservation has none yet (a normal state, not an error).
 */
const useDepositByReservationQuery = createQueryHook<
  Deposit | null,
  { reservationId: string | null | undefined }
>({
  key: DEPOSITS_QUERY_KEY,
  fetcher: (params, api) => api.deposits.getByReservation(params!.reservationId!),
  getEnabled: (params) => !!params?.reservationId,
});

export function useDepositByReservation(reservationId: string | null | undefined) {
  return useDepositByReservationQuery({ reservationId });
}

/* ── useCreateDeposit mutation ───────────────────────── */

/**
 * Collect (create) a deposit for a reservation through the typed `api.deposits`
 * resource, then invalidate the timeline's reservation query AND the deposit
 * read query above, so sibling views (the timeline grid, staff dialogs) and
 * `useDepositByReservation` itself re-read and surface the new deposit — the
 * same cache-invalidation contract every other timeline write follows.
 */
export const useCreateDeposit = createMutationHook<CreateDepositRequest, Deposit>({
  invalidateKeys: [RESERVATIONS_QUERY_KEY, DEPOSITS_QUERY_KEY],
  mutationFn: (api, data) => api.deposits.create(data),
});
