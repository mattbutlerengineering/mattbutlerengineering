import type { SseQueryKey } from "@mbe/types";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";
import { TABLES_QUERY_KEY } from "./useTables.js";
import { FLOOR_PLANS_QUERY_KEY, FLOOR_PLAN_QUERY_KEY } from "./useFloorPlans.js";
import { LAPSING_GUESTS_QUERY_KEY } from "./useGuests.js";

/**
 * Pins this app's query-key constants to the SSE catalog's SseQueryKey
 * strings (@mbe/types SSE_EVENT_CATALOG). useSSESync invalidates by the
 * catalog's strings, so a renamed constant here fails the `satisfies` check,
 * and useSSESync.test.tsx asserts this set equals every key the catalog
 * invalidates.
 */
export const SSE_INVALIDATION_QUERY_KEYS = [
  RESERVATIONS_QUERY_KEY,
  TABLES_QUERY_KEY,
  FLOOR_PLANS_QUERY_KEY,
  FLOOR_PLAN_QUERY_KEY,
  LAPSING_GUESTS_QUERY_KEY,
] as const satisfies readonly SseQueryKey[];
