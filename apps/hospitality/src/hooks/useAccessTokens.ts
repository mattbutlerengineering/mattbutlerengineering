import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AccessToken, CreateAccessTokenRequest, MintedAccessToken } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";
import { useApiClient } from "./useApiClient.js";

const ACCESS_TOKENS_QUERY_KEY = "accessTokens" as const;

/** Settings → Connect an AI assistant: the caller's personal access tokens (no plaintext, ever). */
export const useAccessTokens = createQueryHook<AccessToken[]>({
  key: ACCESS_TOKENS_QUERY_KEY,
  fetcher: (_params, api) => api.accessTokens.list(),
});

export const useRevokeAccessToken = createMutationHook<string>({
  invalidateKeys: ACCESS_TOKENS_QUERY_KEY,
  mutationFn: (api, id) => api.accessTokens.revoke(id),
});

/**
 * Mints a token. A plain callback, not `useMutation`: the plaintext in the
 * result must live only in the component that shows it once, never in the
 * TanStack mutation or query caches (#9665).
 */
export function useMintAccessToken(): (
  input: CreateAccessTokenRequest
) => Promise<MintedAccessToken> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useCallback(
    async (input) => {
      const minted = await api.accessTokens.mint(input);
      void queryClient.invalidateQueries({ queryKey: [ACCESS_TOKENS_QUERY_KEY] });
      return minted;
    },
    [api, queryClient]
  );
}
