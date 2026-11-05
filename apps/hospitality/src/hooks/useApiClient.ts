import { useMemo } from "react";
import { createApiClient } from "@mbe/api-client";
import { useAuth } from "@mbe/auth/react";
import { reportApiError } from "@mbe/sentry/react";

export function useApiClient() {
  const { accessToken, signInSilent } = useAuth();

  return useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
        // A 401 mid-session (expired token, #8258) refreshes once via a silent
        // sign-in, which always fetches a new token. A failed refresh resolves
        // null, and react-oidc-context records it as a silent error that
        // DashboardLayout's "sign in again" banner already surfaces.
        refreshAccessToken: async () => (await signInSilent())?.access_token ?? null,
        onError: reportApiError,
      }),
    [accessToken, signInSilent]
  );
}
