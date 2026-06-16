import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";

/* ── Types ───────────────────────────────────────────── */

export interface QueryHookResult<TData> {
  data: TData | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface CreateQueryHookOptions<TData, TParams = undefined, TResult = TData> {
  /** Base query key string */
  key: string;
  /** Fetcher function — receives params and api client, returns TData */
  fetcher: (params: TParams | undefined, api: ReturnType<typeof useApiClient>) => Promise<TData>;
  /**
   * Optional predicate to derive the `enabled` flag from params.
   * When omitted, the hook is always enabled unless params.enabled === false.
   */
  getEnabled?: (params: (TParams & { enabled?: boolean }) | undefined) => boolean;
  /**
   * Optional transform applied to query.data before returning.
   * Use this to coalesce undefined → null, or extract a nested field.
   */
  select?: (data: TData | undefined) => TResult;
}

type HookParams<TParams> = TParams extends undefined
  ? { enabled?: boolean } | undefined
  : TParams & { enabled?: boolean };

/**
 * Factory that collapses the ~15-line repeated useQuery wrapper pattern
 * into a single declaration per domain hook.
 *
 * Key derivation: [key, params] (params undefined when not provided)
 * Error mapping: query.error ?? null
 * Enabled gating: getEnabled predicate OR params.enabled flag
 * Data transform: optional select function
 */
export function createQueryHook<TData, TParams = undefined, TResult = TData>(
  options: CreateQueryHookOptions<TData, TParams, TResult>
): (params?: HookParams<TParams>) => QueryHookResult<TResult> {
  const { key, fetcher, getEnabled, select } = options;

  return function useQueryHook(params?: HookParams<TParams>): QueryHookResult<TResult> {
    const api = useApiClient();

    const enabled = resolveEnabled(params, getEnabled);
    const queryParams = stripEnabled(params);

    const query = useQuery({
      queryKey: queryParams !== undefined ? [key, queryParams] : [key],
      queryFn: () => fetcher(queryParams as TParams | undefined, api),
      enabled,
    });

    const data = select !== undefined ? select(query.data) : (query.data as unknown as TResult);

    return {
      data,
      isLoading: query.isLoading,
      error: query.error ?? null,
      refetch: query.refetch,
    };
  };
}

/* ── Private helpers ─────────────────────────────────── */

function resolveEnabled<TParams>(
  params: (TParams & { enabled?: boolean }) | undefined,
  getEnabled: ((p: (TParams & { enabled?: boolean }) | undefined) => boolean) | undefined
): boolean {
  if (getEnabled !== undefined) {
    // Custom predicate takes priority — but still respect explicit enabled: false
    if (params !== null && typeof params === "object" && "enabled" in params) {
      const explicit = (params as { enabled?: boolean }).enabled;
      if (explicit === false) return false;
    }
    return getEnabled(params);
  }
  if (params !== null && typeof params === "object" && "enabled" in params) {
    const explicit = (params as { enabled?: boolean }).enabled;
    if (explicit === false) return false;
  }
  return true;
}

function stripEnabled<TParams>(
  params: (TParams & { enabled?: boolean }) | undefined
): TParams | undefined {
  if (params === undefined || params === null) return undefined;
  if (typeof params !== "object") return params as unknown as TParams;
  const { enabled: _enabled, ...rest } = params as Record<string, unknown> & {
    enabled?: boolean;
  };
  // If rest is empty (only key was 'enabled'), return undefined so key stays [key]
  if (Object.keys(rest).length === 0) return undefined;
  return rest as unknown as TParams;
}
