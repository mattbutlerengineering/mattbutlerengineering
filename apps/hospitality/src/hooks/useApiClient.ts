import { useMemo } from "react";
import { createApiClient, type ApiClientError } from "@mbe/api-client";
import { useAuth } from "@mbe/auth/react";
import { captureException, captureMessage, addBreadcrumb } from "@mbe/observability/sentry/react";

function reportToSentry(error: ApiClientError) {
  const code = error.statusCode;

  addBreadcrumb({
    category: "api",
    message: `${error.method} ${error.path} → ${code}`,
    level: code >= 500 ? "error" : "warning",
    data: { statusCode: code, method: error.method, path: error.path },
  });

  if (code >= 500) {
    captureException(error);
  } else if (code === 401 || code === 403) {
    captureMessage(error.message, "warning");
  }
}

export function useApiClient() {
  const { accessToken } = useAuth();

  return useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
        onError: reportToSentry,
      }),
    [accessToken]
  );
}
