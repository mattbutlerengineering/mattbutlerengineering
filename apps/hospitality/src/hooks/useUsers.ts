import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User, UpdateUserRequest, UpdatePreferencesRequest } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";

export const CURRENT_USER_QUERY_KEY = "currentUser" as const;
export const USERS_QUERY_KEY = "users" as const;

/* ── useCurrentUser ──────────────────────────────────── */

export interface UseCurrentUserResult {
  data: User | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCurrentUser(): UseCurrentUserResult {
  const api = useApiClient();

  const query = useQuery({
    queryKey: [CURRENT_USER_QUERY_KEY],
    queryFn: () => api.users.me(),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

/* ── useUpdateCurrentUser mutation ───────────────────── */

export function useUpdateCurrentUser() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserRequest }) =>
      api.users.update(id, data),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData([CURRENT_USER_QUERY_KEY], updatedUser);
    },
  });
}

/* ── useUpdatePreferences mutation ───────────────────── */

export function useUpdatePreferences() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferences: UpdatePreferencesRequest) =>
      api.users.updatePreferences(preferences),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData([CURRENT_USER_QUERY_KEY], updatedUser);
    },
  });
}

/* ── useUsers (admin list) ───────────────────────────── */

export interface UseUsersParams {
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export interface UseUsersResult {
  data: User[] | undefined;
  pagination:
    | {
        total: number;
        totalPages: number;
        page: number;
        limit: number;
        hasNext: boolean;
      }
    | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useUsers(params: UseUsersParams = {}): UseUsersResult {
  const { page = 1, limit = 10, enabled = true } = params;
  const api = useApiClient();

  const query = useQuery({
    queryKey: [USERS_QUERY_KEY, { page, limit }],
    queryFn: async () => {
      return api.users.list(page, limit);
    },
    enabled,
  });

  return {
    data: query.data?.data,
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
