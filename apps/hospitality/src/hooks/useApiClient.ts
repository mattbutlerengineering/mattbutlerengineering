import { useMemo } from "react";
import { createApiClient } from "@mbe/api-client";
import { useAuth } from "@mbe/auth/react";
import { reportApiError } from "@mbe/sentry/react";

export function useApiClient() {
  const { accessToken } = useAuth();

  return useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
        onError: reportApiError,
      }),
    [accessToken]
  );
}
