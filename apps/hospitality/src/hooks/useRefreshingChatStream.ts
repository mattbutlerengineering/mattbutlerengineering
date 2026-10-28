import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { streamNDJSON } from "@mbe/api-client/streaming";
import type { ChatStreamFn } from "@mattbutlerengineering/rialto";

function isConfirmedAction(body: unknown): boolean {
  return typeof body === "object" && body !== null && "actionConfirm" in body;
}

/**
 * `stream`, calling `refresh` when a confirmed action's request ends. That request is
 * the one that runs the write, so the open page then refetches what it changed. A
 * stream that fails part way still refreshes: the write may already have run.
 */
export function refreshAfterConfirm(stream: ChatStreamFn, refresh: () => void): ChatStreamFn {
  return async function* (request) {
    try {
      yield* stream(request);
    } finally {
      if (isConfirmedAction(request.body)) refresh();
    }
  };
}

/** The chat transport for the dashboard: refetches every active query after a confirmed write. */
export function useRefreshingChatStream(): ChatStreamFn {
  const queryClient = useQueryClient();
  return useMemo(
    () => refreshAfterConfirm(streamNDJSON, () => void queryClient.invalidateQueries()),
    [queryClient]
  );
}
