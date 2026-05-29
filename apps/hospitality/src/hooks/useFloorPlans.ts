import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FloorPlan, CreateTableRequest, Table } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";

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

export function useFloorPlans(params: UseFloorPlansParams = {}): UseFloorPlansResult {
  const { venueId, limit = 50, enabled = true } = params;
  const api = useApiClient();

  const query = useQuery({
    queryKey: [FLOOR_PLANS_QUERY_KEY, { venueId, limit }],
    queryFn: async () => {
      const response = await api.floorPlans.list({
        venueId: venueId ?? undefined,
        limit,
      });
      return response.data;
    },
    enabled,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

/* ── useFloorPlan (single) ───────────────────────────── */

export interface UseFloorPlanResult {
  data: FloorPlan | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useFloorPlan(id: string | undefined): UseFloorPlanResult {
  const api = useApiClient();

  const query = useQuery({
    queryKey: [FLOOR_PLAN_QUERY_KEY, id],
    queryFn: async () => {
      const fp = await api.floorPlans.getById(id!);
      return fp;
    },
    enabled: !!id,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

/* ── useCloneFloorPlan mutation ──────────────────────── */

export function useCloneFloorPlan() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.floorPlans.clone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FLOOR_PLANS_QUERY_KEY] });
    },
  });
}

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
