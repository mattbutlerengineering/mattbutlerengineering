import type { GuestMember } from "@mbe/types";
import type { InviteMemberRequest } from "@mbe/api-client";
import { createQueryHook } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";

const GUEST_MEMBERS_QUERY_KEY = "guestMembers" as const;

/** The venue's Regulars Club members, newest invite first. */
export const useMembers = createQueryHook<GuestMember[], { venueId?: string | null }>({
  key: GUEST_MEMBERS_QUERY_KEY,
  fetcher: async (params, api) => (params?.venueId ? api.guests.listMembers(params.venueId) : []),
  getEnabled: (params) => !!params?.venueId,
});

/** Invites a guest by email; the server emails the signed member link. */
export const useInviteMember = createMutationHook<InviteMemberRequest, GuestMember>({
  invalidateKeys: GUEST_MEMBERS_QUERY_KEY,
  mutationFn: (api, data) => api.guests.inviteMember(data),
});

/** Revokes a guest's membership; their member link stops working. */
export const useRevokeMember = createMutationHook<string, { revoked: boolean }>({
  invalidateKeys: GUEST_MEMBERS_QUERY_KEY,
  mutationFn: (api, guestId) => api.guests.revokeMember(guestId),
});
