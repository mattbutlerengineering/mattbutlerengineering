import { useQuery } from "@tanstack/react-query";
import type { Reservation } from "@mbe/types";
import type { ListReservationsParams } from "@mbe/api-client";
import { useApiClient } from "./useApiClient.js";

export const RESERVATIONS_QUERY_KEY = "reservations" as const;

export interface UseReservationsParams extends ListReservationsParams {
  enabled?: boolean;
}

export interface UseReservationsResult {
  data: Reservation[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useReservations(
  params: UseReservationsParams = {}
): UseReservationsResult {
  const { enabled = true, ...queryParams } = params;
  const api = useApiClient();

  const query = useQuery({
    queryKey: [RESERVATIONS_QUERY_KEY, queryParams],
    queryFn: async () => {
      const response = await api.reservations.list(queryParams);
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
