import { useState, useEffect, useCallback, useRef } from "react";
import type { DependencyList } from "react";

export interface UseDataFetchOptions<T> {
  url: string;
  parser?: (data: unknown) => T;
  deps?: DependencyList;
}

export interface UseDataFetchReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useDataFetch<T>(options: UseDataFetchOptions<T>): UseDataFetchReturn<T> {
  const { url, parser, deps } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Incremented by refetch() to re-trigger the effect without an external dep change.
  const [fetchKey, setFetchKey] = useState(0);

  // Track the active controller so unmount/refetch can abort in-flight requests.
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(url, { signal });

        if (signal.aborted) return;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const json: unknown = await response.json();

        if (signal.aborted) return;

        const result = parser ? parser(json) : (json as T);
        setData(result);
      } catch (err) {
        if (signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      controller.abort();
    };
    // fetchKey drives manual refetches; deps are caller-provided re-fetch triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, parser, fetchKey, ...(deps ?? [])]);

  const refetch = useCallback(async () => {
    controllerRef.current?.abort();
    setFetchKey((k) => k + 1);
  }, []);

  return { data, isLoading, error, refetch };
}
