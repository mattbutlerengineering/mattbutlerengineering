import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";

/* ── Types ───────────────────────────────────────────── */

export interface CreateMutationHookOptions<TVariables, TData = unknown> {
  /** Query key string to invalidate on successful mutation */
  invalidateKey: string;
  /** Mutation function — receives api client and variables, returns a promise */
  mutationFn: (api: ReturnType<typeof useApiClient>, variables: TVariables) => Promise<TData>;
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
 * Invalidation: queryClient.invalidateQueries({ queryKey: [invalidateKey] }) on success
 * Error mapping: mutation.error ?? null
 */
export function createMutationHook<TVariables, TData = unknown>(
  options: CreateMutationHookOptions<TVariables, TData>
): () => MutationHookResult<TVariables, TData> {
  const { invalidateKey, mutationFn } = options;

  return function useMutationHook(): MutationHookResult<TVariables, TData> {
    const api = useApiClient();
    const queryClient = useQueryClient();

    const mutation = useMutation<TData, Error, TVariables>({
      mutationFn: (variables) => mutationFn(api, variables),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [invalidateKey] });
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
