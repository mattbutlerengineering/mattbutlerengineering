import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { captureException } from "@mbe/observability/sentry/react";
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
 * Custom hook wrapping specs CRUD API calls with auth.
 * Provides optimistic updates for toggleFavorite and deleteSpec.
 * Auto-fetches specs on mount.
 */
export function useSpecsApi(): UseSpecsApiReturn {
  const { accessToken } = useAuth();

  const [specs, setSpecs] = useState<StoredSpec[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const authFetch = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      return fetch(input, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...init?.headers,
        },
      });
    },
    [accessToken]
  );

  const fetchSpecs = useCallback(async (): Promise<void> => {
    // NOTE: We deliberately do NOT call setIsLoading(true) synchronously here.
    // `isLoading` is initialized to `true`, and this hook calls fetchSpecs once
    // on mount via useEffect — a synchronous setState inside that effect would
    // trigger react-hooks's "setState within an effect can trigger cascading
    // renders" rule. Manual refetchers that need a loading indicator can read
    // `isLoading` (which flips to false after first success) and manage their
    // own UI state, or we can introduce a separate `isRefreshing` flag later.
    try {
      const response = await authFetch("/api/gen/specs");
      if (!response.ok) {
        throw new Error(`Failed to fetch specs: ${response.statusText}`);
      }
      const json = (await response.json()) as { data: StoredSpec[] };
      setSpecs(json.data);
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  const saveSpec = useCallback(
    async (data: SaveSpecData): Promise<StoredSpec> => {
      const response = await authFetch("/api/gen/specs", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`Failed to save spec: ${response.statusText}`);
      }
      const json = (await response.json()) as { data: StoredSpec };
      const created = json.data;
      // Prepend to local state (immutable update)
      setSpecs((prev) => [created, ...prev]);
      return created;
    },
    [authFetch]
  );

  const toggleFavorite = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic update — immediately flip isFavorite
      setSpecs((prev) => prev.map((s) => (s.id === id ? { ...s, isFavorite: !s.isFavorite } : s)));
      try {
        const response = await authFetch(`/api/gen/specs/${id}/favorite`, {
          method: "PATCH",
        });
        if (!response.ok) {
          throw new Error(`Failed to toggle favorite: ${response.statusText}`);
        }
      } catch (err) {
        // Revert optimistic update on error
        setSpecs((prev) =>
          prev.map((s) => (s.id === id ? { ...s, isFavorite: !s.isFavorite } : s))
        );
        captureException(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [authFetch]
  );

  const deleteSpec = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic removal from local state
      const previous = specs;
      setSpecs((prev) => prev.filter((s) => s.id !== id));
      try {
        const response = await authFetch(`/api/gen/specs/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(`Failed to delete spec: ${response.statusText}`);
        }
      } catch (err) {
        // Revert on error
        setSpecs(previous);
        captureException(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [authFetch, specs]
  );

  useEffect(() => {
    queueMicrotask(() => void fetchSpecs());
  }, [fetchSpecs]);

  return { specs, isLoading, fetchSpecs, saveSpec, toggleFavorite, deleteSpec };
}
