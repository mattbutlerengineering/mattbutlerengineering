import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  User,
  UpdateUserRequest,
  UpdatePreferencesRequest,
  PaginatedResponse,
} from "@mbe/types";
import { useApiClient } from "./useApiClient.js";
import { createQueryHook, type QueryHookResult } from "./create-query-hook.js";

export const CURRENT_USER_QUERY_KEY = "currentUser" as const;
export const USERS_QUERY_KEY = "users" as const;

/* ── useCurrentUser ──────────────────────────────────── */

export interface UseCurrentUserResult {
  data: User | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const useCurrentUserQuery = createQueryHook<User | null>({
  key: CURRENT_USER_QUERY_KEY,
  fetcher: (_params, api) => api.users.me(),
  select: (data) => data ?? null,
});

export function useCurrentUser(): UseCurrentUserResult {
  return useCurrentUserQuery() as QueryHookResult<User | null>;
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
    mutationFn: (preferences: UpdatePreferencesRequest) => api.users.updatePreferences(preferences),
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

const useUsersQuery = createQueryHook<PaginatedResponse<User>, UseUsersParams>({
  key: USERS_QUERY_KEY,
  fetcher: (params, api) => api.users.list(params?.page ?? 1, params?.limit ?? 10),
});

export function useUsers(params: UseUsersParams = {}): UseUsersResult {
  const result = useUsersQuery(params);
  return {
    data: result.data?.data,
    pagination: result.data?.pagination,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}
