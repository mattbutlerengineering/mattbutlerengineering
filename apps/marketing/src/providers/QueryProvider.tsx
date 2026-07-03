import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface QueryProviderProps {
  readonly children: ReactNode;
}

function createQueryClient(): QueryClient {
  // E2E test harness sets window.__e2eNoRetry = true via addInitScript so that
  // react-query error states appear immediately (within the 5s assertion window)
  // instead of after the default 3x exponential backoff (~7s). Production always
  // uses retry: 3.
  const e2eNoRetry =
    typeof window !== "undefined" &&
    (window as unknown as { __e2eNoRetry?: boolean }).__e2eNoRetry === true;

  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // 3 attempts with exponential backoff: ~1s, ~2s, ~4s
        retry: e2eNoRetry ? 0 : 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
