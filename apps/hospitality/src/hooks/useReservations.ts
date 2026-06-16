import type { Reservation } from "@mbe/types";
import type { ListReservationsParams } from "@mbe/api-client";
import { createQueryHook } from "./create-query-hook.js";

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

export const useReservations = createQueryHook<Reservation[], UseReservationsParams>({
  key: RESERVATIONS_QUERY_KEY,
  fetcher: async (params, api) => {
    const response = await api.reservations.list(params ?? {});
    return response.data;
  },
});
