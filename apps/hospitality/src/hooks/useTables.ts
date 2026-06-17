import type { Table } from "@mbe/types";
import type { ListTablesParams } from "@mbe/api-client";
import { createQueryHook } from "./create-query-hook.js";

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

export const useTables = createQueryHook<Table[], UseTablesParams>({
  key: TABLES_QUERY_KEY,
  fetcher: async (params, api) => {
    const response = await api.tables.list(params ?? {});
    return response.data;
  },
});
