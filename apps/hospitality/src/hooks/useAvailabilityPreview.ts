import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PreviewAvailabilityBody, PreviewResult } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";

const AVAILABILITY_PREVIEW_QUERY_KEY = "availabilityPreview" as const;

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
  body: PreviewAvailabilityBody | null,
  /**
   * The config version the draft is built on. It is part of the request's identity: the same body
   * over a different base is a different question, so a reload that moves the base asks again
   * rather than replaying an answer cached for the old one.
   */
  baseVersion?: number
): AvailabilityPreviewState {
  const api = useApiClient();
  const query = useQuery({
    queryKey: [AVAILABILITY_PREVIEW_QUERY_KEY, venueId, body, baseVersion],
    queryFn: () => api.availability.previewConfig(venueId, body as PreviewAvailabilityBody),
    enabled: body !== null,
    retry: false,
  });
  const [lastGood, setLastGood] = useState<PreviewResult | null>(null);
  // Adjusting state during render (not in an effect) so the kept result is never a frame behind.
  if (query.data && query.data !== lastGood) setLastGood(query.data);

  // A first request that failed has no data, so retrying it clears the error (react-query resets
  // a query with no data to "pending"). Keep the error up while the same request is retried, so
  // the Retry button that asked for it is not unmounted from under the Manager's focus.
  const requestKey = JSON.stringify([venueId, body, baseVersion]);
  const [failed, setFailed] = useState<{ key: string; error: Error } | null>(null);
  if (query.error && failed?.error !== query.error) {
    setFailed({ key: requestKey, error: query.error });
  } else if (!query.error && !query.isFetching && failed) {
    setFailed(null);
  }
  const retryingError =
    !query.error && query.isFetching && failed?.key === requestKey ? failed.error : null;

  return {
    result: query.data ?? lastGood,
    isFetching: query.isFetching,
    error: query.error ?? retryingError,
    retry: () => void query.refetch(),
  };
}
