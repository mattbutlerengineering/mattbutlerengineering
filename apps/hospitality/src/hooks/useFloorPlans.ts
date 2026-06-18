import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FloorPlan, CreateTableRequest, Table } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";
import { createQueryHook, type QueryHookResult } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";

export const FLOOR_PLANS_QUERY_KEY = "floorPlans" as const;
export const FLOOR_PLAN_QUERY_KEY = "floorPlan" as const;

/* ── useFloorPlans ───────────────────────────────────── */

export interface UseFloorPlansParams {
  venueId?: string | null;
  limit?: number;
  enabled?: boolean;
}

export interface UseFloorPlansResult {
  data: FloorPlan[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export const useFloorPlans = createQueryHook<FloorPlan[], UseFloorPlansParams>({
  key: FLOOR_PLANS_QUERY_KEY,
  fetcher: async (params, api) => {
    const response = await api.floorPlans.list({
      venueId: params?.venueId ?? undefined,
      limit: params?.limit ?? 50,
    });
    return response.data;
  },
});

/* ── useFloorPlan (single) ───────────────────────────── */

export interface UseFloorPlanResult {
  data: FloorPlan | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const useFloorPlanQuery = createQueryHook<FloorPlan | null, { id: string | undefined }>({
  key: FLOOR_PLAN_QUERY_KEY,
  fetcher: async (params, api) => {
    const fp = await api.floorPlans.getById(params!.id!);
    return fp;
  },
  getEnabled: (params) => !!params?.id,
  select: (data) => data ?? null,
});

export function useFloorPlan(id: string | undefined): UseFloorPlanResult {
  return useFloorPlanQuery({ id }) as QueryHookResult<FloorPlan | null>;
}

/* ── useCloneFloorPlan mutation ──────────────────────── */

export const useCloneFloorPlan = createMutationHook<string, FloorPlan>({
  invalidateKey: FLOOR_PLANS_QUERY_KEY,
  mutationFn: (api, id) => api.floorPlans.clone(id),
});

/* ── useActivateFloorPlan mutation ───────────────────── */

export function useActivateFloorPlan() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.floorPlans.setActive(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [FLOOR_PLANS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [FLOOR_PLAN_QUERY_KEY, id] });
    },
  });
}

/* ── useBulkUpdatePositions mutation ─────────────────── */

export interface BulkUpdatePositionsPayload {
  floorPlanId: string;
  positions: Parameters<ReturnType<typeof useApiClient>["floorPlans"]["bulkUpdatePositions"]>[1];
}

export function useBulkUpdatePositions() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ floorPlanId, positions }: BulkUpdatePositionsPayload) =>
      api.floorPlans.bulkUpdatePositions(floorPlanId, positions),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [FLOOR_PLAN_QUERY_KEY, variables.floorPlanId] });
    },
  });
}

/* ── useAddTable mutation ────────────────────────────── */

export function useAddTable() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTableRequest) => api.tables.create(data),
    onSuccess: (_data: Table, variables: CreateTableRequest) => {
      queryClient.invalidateQueries({ queryKey: [FLOOR_PLAN_QUERY_KEY, variables.floorPlanId] });
    },
  });
}

/* ── useDeleteTable mutation ─────────────────────────── */

export function useDeleteTable() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tableId: string) => api.tables.delete(tableId),
    onSuccess: () => {
      // Invalidate all floor plan detail queries since we don't know which plan
      queryClient.invalidateQueries({ queryKey: [FLOOR_PLAN_QUERY_KEY] });
    },
  });
}
