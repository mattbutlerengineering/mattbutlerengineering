import { useMemo } from "react";
import { createApiClient } from "@mbe/api-client";

export interface UsePublicApiClientOptions {
  baseUrl?: string;
  maxRetries?: number;
  /** Regulars Club member link (#9627): sent as `x-member-token` so the server widens the booking window. */
  memberToken?: string;
}

/**
 * Seam hook for public (unauthenticated) API client construction.
 * Token strategy is fixed here, once: no access token is ever attached —
 * these clients back visitor-facing routes (booking widget, manage-reservation
 * lookup) that must work without a signed-in session.
 */
export function usePublicApiClient(options: UsePublicApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? import.meta.env.VITE_API_URL ?? "";
  const { maxRetries, memberToken } = options;

  return useMemo(
    () =>
      createApiClient({
        baseUrl,
        getAccessToken: () => null,
        maxRetries,
        defaultHeaders: memberToken ? { "x-member-token": memberToken } : undefined,
      }),
    [baseUrl, maxRetries, memberToken]
  );
}
