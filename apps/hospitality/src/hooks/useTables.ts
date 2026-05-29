import { useQuery } from "@tanstack/react-query";
import type { Table } from "@mbe/types";
import type { ListTablesParams } from "@mbe/api-client";
import { useApiClient } from "./useApiClient.js";

export const TABLES_QUERY_KEY = "tables" as const;

export interface UseTablesParams extends ListTablesParams {
  enabled?: boolean;
}

export interface UseTablesResult {
  data: Table[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useTables(params: UseTablesParams = {}): UseTablesResult {
  const { enabled = true, ...queryParams } = params;
  const api = useApiClient();

  const query = useQuery({
    queryKey: [TABLES_QUERY_KEY, queryParams],
    queryFn: async () => {
      const response = await api.tables.list(queryParams);
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
