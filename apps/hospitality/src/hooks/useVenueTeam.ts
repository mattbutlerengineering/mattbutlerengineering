import type { TeamRole, VenueTeam } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";

const VENUE_TEAM_QUERY_KEY = "venueTeam" as const;

/** Settings → Team: members' Manager / Host roles and the Host emergency-close grant. */
export const useVenueTeam = createQueryHook<VenueTeam | null, { venueId: string | null }>({
  key: VENUE_TEAM_QUERY_KEY,
  fetcher: async (params, api) => (params?.venueId ? api.venueTeam.get(params.venueId) : null),
  getEnabled: (params) => !!params?.venueId && params.enabled !== false,
});

export const useSetTeamRole = createMutationHook<{
  venueId: string;
  userSub: string;
  role: TeamRole;
}>({
  invalidateKeys: VENUE_TEAM_QUERY_KEY,
  mutationFn: (api, { venueId, userSub, role }) => api.venueTeam.setRole(venueId, userSub, role),
});

export const useSetHostEmergencyClose = createMutationHook<{ venueId: string; enabled: boolean }>({
  invalidateKeys: VENUE_TEAM_QUERY_KEY,
  mutationFn: (api, { venueId, enabled }) => api.venueTeam.setHostEmergencyClose(venueId, enabled),
});
