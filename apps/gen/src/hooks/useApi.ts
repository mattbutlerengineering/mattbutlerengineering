import { useMemo } from "react";
import { ApiClient } from "@mbe/api-client";
import { useAuth } from "@mbe/auth/react";

/**
 * Single API client construction site for the gen app.
 *
 * Token strategy is decided here, once: attach the access token when the
 * visitor is authenticated, send none otherwise. The one route that doesn't
 * require auth (`GET /api/gen/specs/:id`, see SharedSpecPage) is permissive —
 * an optional bearer token on an anonymous visit is simply ignored server-side.
 */
export function useApi(): ApiClient {
  const { accessToken } = useAuth();

  return useMemo(
    () => new ApiClient({ baseUrl: "", getAccessToken: () => accessToken }),
    [accessToken]
  );
}
