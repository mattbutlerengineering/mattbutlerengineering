import type {
  AvailabilityChangesPage,
  AvailabilityChangesQuery,
  AvailabilityConfigChanges,
  AvailabilityConfigSaveResult,
  AvailabilityConfigState,
  AvailabilityDaySummary,
} from "@mbe/types";
import { createMutationHook } from "./create-mutation-hook.js";
import { createQueryHook } from "./create-query-hook.js";
import { VENUES_QUERY_KEY } from "./useVenues.js";

export const AVAILABILITY_DAYS_QUERY_KEY = "availabilityDays" as const;
export const AVAILABILITY_CONFIG_QUERY_KEY = "availabilityConfig" as const;
export const AVAILABILITY_CHANGES_QUERY_KEY = "availabilityChanges" as const;

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

/**
 * Saves a config change (Manager only). Venue readiness reads the legacy hours the server
 * projects from the regular week, so the venues list refreshes with the config and the days.
 */
export const useSaveAvailabilityConfig = createMutationHook<
  {
    venueId: string;
    expectedVersion: number;
    changes: AvailabilityConfigChanges;
  },
  AvailabilityConfigSaveResult
>({
  invalidateKeys: [
    AVAILABILITY_CONFIG_QUERY_KEY,
    AVAILABILITY_DAYS_QUERY_KEY,
    AVAILABILITY_CHANGES_QUERY_KEY,
    VENUES_QUERY_KEY,
  ],
  mutationFn: (api, { venueId, expectedVersion, changes }) =>
    api.availability.saveConfig(venueId, { expectedVersion, changes }),
});

/** The History drawer (F12): who changed availability, newest first. */
export const useAvailabilityChanges = createQueryHook<
  AvailabilityChangesPage | null,
  { venueId: string | null; query: AvailabilityChangesQuery }
>({
  key: AVAILABILITY_CHANGES_QUERY_KEY,
  fetcher: async (params, api) =>
    params?.venueId ? api.availability.listChanges(params.venueId, params.query) : null,
  getEnabled: (params) => !!params?.venueId && params.enabled !== false,
});

/**
 * Undoes a change (Manager only): the server applies its stored inverse as a new save, so
 * everything a save refreshes refreshes here too.
 */
export const useRevertAvailabilityChange = createMutationHook<
  { venueId: string; changeId: string; expectedVersion: number },
  AvailabilityConfigSaveResult
>({
  invalidateKeys: [
    AVAILABILITY_CONFIG_QUERY_KEY,
    AVAILABILITY_DAYS_QUERY_KEY,
    AVAILABILITY_CHANGES_QUERY_KEY,
    VENUES_QUERY_KEY,
  ],
  mutationFn: (api, { venueId, changeId, expectedVersion }) =>
    api.availability.revertChange(venueId, changeId, expectedVersion),
});
