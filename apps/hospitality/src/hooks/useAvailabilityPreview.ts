import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PreviewAvailabilityBody, PreviewResult } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";

export const AVAILABILITY_PREVIEW_QUERY_KEY = "availabilityPreview" as const;

export interface AvailabilityPreviewState {
  /** The newest result that arrived, kept while a newer request is pending or has failed. */
  readonly result: PreviewResult | null;
  /** A request for the current draft is in flight. */
  readonly isFetching: boolean;
  /** The request for the current draft failed (the last good `result` is still set). */
  readonly error: Error | null;
  readonly retry: () => void;
}

/**
 * What an unsaved draft changes (architecture § Availability API, `POST …/availability/preview`).
 * Read-only, so it never invalidates anything. `body` is `null` while there is nothing to
 * preview. A failed or slow request must not blank the panel, so the last good result is kept.
 */
export function useAvailabilityPreview(
  venueId: string,
  body: PreviewAvailabilityBody | null
): AvailabilityPreviewState {
  const api = useApiClient();
  const query = useQuery({
    queryKey: [AVAILABILITY_PREVIEW_QUERY_KEY, venueId, body],
    queryFn: () => api.availability.previewConfig(venueId, body as PreviewAvailabilityBody),
    enabled: body !== null,
    retry: false,
  });
  const [lastGood, setLastGood] = useState<PreviewResult | null>(null);
  // Adjusting state during render (not in an effect) so the kept result is never a frame behind.
  if (query.data && query.data !== lastGood) setLastGood(query.data);

  return {
    result: query.data ?? lastGood,
    isFetching: query.isFetching,
    error: query.error ?? null,
    retry: () => void query.refetch(),
  };
}
