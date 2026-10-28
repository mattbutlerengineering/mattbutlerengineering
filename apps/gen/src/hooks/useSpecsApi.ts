import { useState, useCallback, useEffect, useRef } from "react";
import { useApi } from "./useApi.js";
import type { EntryKind, StoredSpec } from "../types.js";
import type { SpecDiff } from "../lib/spec-subtree.js";
import { decodeSpecDiff } from "../lib/spec.js";

export interface SaveSpecData {
  prompt: string;
  kind?: EntryKind;
  spec: unknown;
  rawLines: string[];
  refinement?: SpecDiff;
}

// The payload is untrusted: a malformed refinement becomes null rather than reaching replay.
function decodeStored(entry: StoredSpec): StoredSpec {
  return "refinement" in entry ? { ...entry, refinement: decodeSpecDiff(entry.refinement) } : entry;
}

export interface UseSpecsApiReturn {
  specs: StoredSpec[];
  isLoading: boolean;
  /** Set when the most recent fetchSpecs() call failed; cleared on the next
   *  successful fetch. Lets the UI show a deliberate error state instead of
   *  an indistinguishable "no history yet". */
  error: Error | null;
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
  const client = useApi();

  const [specs, setSpecs] = useState<StoredSpec[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Mirror of specs in a ref so deleteSpec can read the current list without
  // taking specs as a useCallback dependency (which would recreate on every render).
  const specsRef = useRef<StoredSpec[]>(specs);
  useEffect(() => {
    specsRef.current = specs;
  }, [specs]);

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
      setSpecs(json.data.map(decodeStored));
      setError(null);
    } catch (err) {
      console.error("[useSpecsApi] fetchSpecs error:", err);
      setError(err instanceof Error ? err : new Error("Failed to load history."));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const saveSpec = useCallback(
    async (data: SaveSpecData): Promise<StoredSpec> => {
      const json = await client.post<{ data: StoredSpec }>("/api/gen/specs", data);
      const created = decodeStored(json.data);
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
      // Read current specs via ref — avoids adding specs to the dep array,
      // keeping deleteSpec identity stable across renders.
      const itemToDelete = specsRef.current.find((s) => s.id === id);
      // Optimistic removal from local state
      setSpecs((prev) => prev.filter((s) => s.id !== id));
      try {
        await client.delete(`/api/gen/specs/${id}`);
      } catch (err) {
        // Revert only the failed item via functional update — concurrent
        // successful deletes are not affected (no stale snapshot overwrite).
        if (itemToDelete !== undefined) {
          setSpecs((prev) => (prev.some((s) => s.id === id) ? prev : [...prev, itemToDelete]));
        }
        console.error("[useSpecsApi] deleteSpec error:", err);
      }
    },
    [client]
  );

  useEffect(() => {
    queueMicrotask(() => void fetchSpecs());
  }, [fetchSpecs]);

  return { specs, isLoading, error, fetchSpecs, saveSpec, toggleFavorite, deleteSpec };
}
