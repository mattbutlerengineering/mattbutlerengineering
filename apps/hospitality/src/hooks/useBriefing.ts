import { useQuery } from "@tanstack/react-query";
import type { BriefingResponse } from "@mbe/api-client";
import { useApiClient } from "./useApiClient.js";

export const BRIEFING_QUERY_KEY = "briefing" as const;

export interface UseBriefingParams {
  venueId?: string;
  date?: string;
  enabled?: boolean;
}

export interface UseBriefingResult {
  data: BriefingResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useBriefing(params: UseBriefingParams = {}): UseBriefingResult {
  const { venueId, date, enabled = true } = params;
  const api = useApiClient();

  const query = useQuery({
    queryKey: [BRIEFING_QUERY_KEY, venueId, date],
    queryFn: async () => {
      return api.briefing.get(venueId!, date);
    },
    enabled: enabled && Boolean(venueId),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
