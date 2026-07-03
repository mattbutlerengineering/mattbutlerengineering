import { useMemo } from "react";
import { createApiClient } from "@mbe/api-client";

export interface UsePublicApiClientOptions {
  baseUrl?: string;
  maxRetries?: number;
}

/**
 * Seam hook for public (unauthenticated) API client construction.
 * Token strategy is fixed here, once: no access token is ever attached —
 * these clients back visitor-facing routes (booking widget, manage-reservation
 * lookup) that must work without a signed-in session.
 */
export function usePublicApiClient(options: UsePublicApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? import.meta.env.VITE_API_URL ?? "";
  const { maxRetries } = options;

  return useMemo(
    () => createApiClient({ baseUrl, getAccessToken: () => null, maxRetries }),
    [baseUrl, maxRetries]
  );
}
