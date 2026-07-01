import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";

/* ── Types ───────────────────────────────────────────── */

export interface CreateMutationHookOptions<TVariables, TData = unknown> {
  /** One or more static query keys to invalidate on successful mutation */
  invalidateKeys: string | readonly string[];
  /** Mutation function — receives api client and variables, returns a promise */
  mutationFn: (api: ReturnType<typeof useApiClient>, variables: TVariables) => Promise<TData>;
  /**
   * Optional dynamic invalidation callback, called after the static
   * invalidateKeys are invalidated. Use when invalidation keys depend on
   * the mutation's variables or returned data.
   */
  onSuccess?: (queryClient: QueryClient, data: TData, variables: TVariables) => void;
}

export interface MutationHookResult<TVariables, TData = unknown> {
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Factory that collapses the ~15-line repeated useMutation boilerplate
 * into a single declaration per mutation hook.
 *
 * Invalidation: each key in invalidateKeys is invalidated via
 * queryClient.invalidateQueries({ queryKey: [key] }) on success, then the
 * optional onSuccess callback runs for parameterized/dynamic invalidation.
 * Error mapping: mutation.error ?? null
 */
export function createMutationHook<TVariables, TData = unknown>(
  options: CreateMutationHookOptions<TVariables, TData>
): () => MutationHookResult<TVariables, TData> {
  const { invalidateKeys, mutationFn, onSuccess } = options;

  return function useMutationHook(): MutationHookResult<TVariables, TData> {
    const api = useApiClient();
    const queryClient = useQueryClient();

    const mutation = useMutation<TData, Error, TVariables>({
      mutationFn: (variables) => mutationFn(api, variables),
      onSuccess: (data, variables) => {
        const keys = Array.isArray(invalidateKeys) ? invalidateKeys : [invalidateKeys];
        for (const key of keys) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        onSuccess?.(queryClient, data, variables);
      },
    });

    return {
      mutate: mutation.mutate,
      mutateAsync: mutation.mutateAsync,
      isPending: mutation.isPending,
      isSuccess: mutation.isSuccess,
      isError: mutation.isError,
      error: mutation.error ?? null,
    };
  };
}
