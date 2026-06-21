/**
 * Fetches the venue cancellation policy for use in the staff cancel dialog.
 *
 * Uses the public `/public/v1/venues/:slug` endpoint (same source as the booking
 * widget) which is the only API surface that exposes deposit/policy fields.
 * No auth required, but we still use the api client for consistency.
 */
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { CancellationPolicy } from "../utils/cancellation-fee.js";

interface PublicVenueDepositResponse {
  data?: {
    deposit?: {
      enabled: boolean;
      amountCents: number | null;
      freeCancellationHours: number | null;
      lateCancellationFeePercent: number | null;
      noShowFeePercent: number | null;
    };
  };
}

export const VENUE_POLICY_QUERY_KEY = "venue-policy" as const;

/**
 * Returns the cancellation policy for a venue by slug.
 * Returns `null` when no deposit is enabled or policy fields are absent.
 */
export function useVenuePolicy(slug: string | undefined): {
  policy: CancellationPolicy | null;
  isLoading: boolean;
} {
  const api = useApiClient();

  const query = useQuery({
    queryKey: [VENUE_POLICY_QUERY_KEY, slug],
    queryFn: async (): Promise<CancellationPolicy | null> => {
      if (!slug) return null;
      try {
        const body = await api.client.get<PublicVenueDepositResponse>(
          `/public/v1/venues/${encodeURIComponent(slug)}`
        );
        const deposit = body.data?.deposit;
        if (!deposit?.enabled || deposit.amountCents == null) return null;
        return {
          depositAmountCents: deposit.amountCents,
          freeCancellationHours: deposit.freeCancellationHours,
          lateCancellationFeePercent: deposit.lateCancellationFeePercent,
          noShowFeePercent: deposit.noShowFeePercent,
        };
      } catch {
        return null;
      }
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000, // 5 minutes — policy rarely changes during a shift
  });

  return {
    policy: query.data ?? null,
    isLoading: query.isLoading,
  };
}
