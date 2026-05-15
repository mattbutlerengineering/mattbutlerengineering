import { useState, useCallback, useRef } from "react";

/* ── Types ───────────────────────────────────── */

export interface UseApiCallOptions {
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
}

export interface UseApiCallResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  /** Re-execute the last call */
  retry: () => void;
  /** Execute a new call */
  execute: (fn: (signal: AbortSignal) => Promise<T>) => Promise<T | null>;
  /** Milliseconds since last successful fetch, or null if never fetched */
  staleness: number | null;
  /** Clear error state */
  clearError: () => void;
}

/* ── Hook ────────────────────────────────────── */

export function useApiCall<T>(options?: UseApiCallOptions): UseApiCallResult<T> {
  const { timeout = 10_000 } = options ?? {};

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const lastCallRef = useRef<((signal: AbortSignal) => Promise<T>) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (fn: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
      // Abort any in-flight request
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      lastCallRef.current = fn;

      setIsLoading(true);
      setError(null);

      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const result = await fn(controller.signal);

        if (!controller.signal.aborted) {
          setData(result);
          setLastFetchedAt(Date.now());
        }

        return controller.signal.aborted ? null : result;
      } catch (err) {
        if (controller.signal.aborted) {
          setError("Request timed out. Please try again.");
        } else {
          setError(err instanceof Error ? err.message : "An unexpected error occurred.");
        }
        return null;
      } finally {
        clearTimeout(timeoutId);
        setIsLoading(false);
      }
    },
    [timeout]
  );

  const retry = useCallback(() => {
    if (lastCallRef.current) {
      execute(lastCallRef.current);
    }
  }, [execute]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const staleness = lastFetchedAt !== null ? Date.now() - lastFetchedAt : null;

  return { data, isLoading, error, retry, execute, staleness, clearError };
}
