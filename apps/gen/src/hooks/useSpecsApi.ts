import { useState, useCallback, useEffect, useMemo } from "react";
import { useAuth } from "@mbe/auth/react";
import { ApiClient } from "@mbe/api-client";
import type { StoredSpec } from "../types.js";

export interface SaveSpecData {
  prompt: string;
  spec: unknown;
  rawLines: string[];
}

export interface UseSpecsApiReturn {
  specs: StoredSpec[];
  isLoading: boolean;
  fetchSpecs: () => Promise<void>;
  saveSpec: (data: SaveSpecData) => Promise<StoredSpec>;
  toggleFavorite: (id: string) => Promise<void>;
  deleteSpec: (id: string) => Promise<void>;
}

/**
 * Custom hook wrapping specs CRUD API calls with auth via @mbe/api-client.
 * Provides optimistic updates for toggleFavorite and deleteSpec.
 * Auto-fetches specs on mount.
 */
export function useSpecsApi(): UseSpecsApiReturn {
  const { accessToken } = useAuth();

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl: "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  const [specs, setSpecs] = useState<StoredSpec[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSpecs = useCallback(async (): Promise<void> => {
    // NOTE: We deliberately do NOT call setIsLoading(true) synchronously here.
    // `isLoading` is initialized to `true`, and this hook calls fetchSpecs once
    // on mount via useEffect — a synchronous setState inside that effect would
    // trigger react-hooks's "setState within an effect can trigger cascading
    // renders" rule. Manual refetchers that need a loading indicator can read
    // `isLoading` (which flips to false after first success) and manage their
    // own UI state, or we can introduce a separate `isRefreshing` flag later.
    try {
      const json = await client.get<{ data: StoredSpec[] }>("/api/gen/specs");
      setSpecs(json.data);
    } catch (err) {
      console.error("[useSpecsApi] fetchSpecs error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const saveSpec = useCallback(
    async (data: SaveSpecData): Promise<StoredSpec> => {
      const json = await client.post<{ data: StoredSpec }>("/api/gen/specs", data);
      const created = json.data;
      // Prepend to local state (immutable update)
      setSpecs((prev) => [created, ...prev]);
      return created;
    },
    [client]
  );

  const toggleFavorite = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic update — immediately flip isFavorite
      setSpecs((prev) => prev.map((s) => (s.id === id ? { ...s, isFavorite: !s.isFavorite } : s)));
      try {
        await client.patch(`/api/gen/specs/${id}/favorite`, {});
      } catch (err) {
        // Revert optimistic update on error
        setSpecs((prev) =>
          prev.map((s) => (s.id === id ? { ...s, isFavorite: !s.isFavorite } : s))
        );
        console.error("[useSpecsApi] toggleFavorite error:", err);
      }
    },
    [client]
  );

  const deleteSpec = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic removal from local state
      const previous = specs;
      setSpecs((prev) => prev.filter((s) => s.id !== id));
      try {
        await client.delete(`/api/gen/specs/${id}`);
      } catch (err) {
        // Revert on error
        setSpecs(previous);
        console.error("[useSpecsApi] deleteSpec error:", err);
      }
    },
    [client, specs]
  );

  useEffect(() => {
    queueMicrotask(() => void fetchSpecs());
  }, [fetchSpecs]);

  return { specs, isLoading, fetchSpecs, saveSpec, toggleFavorite, deleteSpec };
}
