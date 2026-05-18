import { useState, useRef, useCallback, useEffect } from "react";
import { streamNDJSON } from "@mbe/api-client/streaming";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface UseChatStreamOptions {
  api: string;
  getAccessToken: () => string | null | undefined;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: Error | null;
  send: (content: string) => Promise<void>;
  stop: () => void;
}

/**
 * Hook for multi-turn chat streaming with NDJSON protocol.
 * Manages message history and streams assistant responses chunk by chunk.
 */
export function useChatStream({
  api,
  getAccessToken,
  onComplete,
  onError,
}: UseChatStreamOptions): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Stable refs for callbacks
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const getAccessTokenRef = useRef(getAccessToken);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
  }, [getAccessToken]);

  // Keep a ref to messages for use inside send without stale closure
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const send = useCallback(
    async (content: string): Promise<void> => {
      // Abort any in-flight request
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };

      // Append user message and start streaming
      const historyWithUser = [...messagesRef.current, userMsg];
      setMessages(historyWithUser);
      setIsStreaming(true);
      setError(null);

      // Build assistant placeholder
      const assistantId = crypto.randomUUID();
      let accumulatedContent = "";

      try {
        const token = getAccessTokenRef.current();

        const stream = streamNDJSON<{ type: string; content: string }>({
          url: api,
          body: {
            messages: historyWithUser.map((m) => ({ role: m.role, content: m.content })),
          },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });

        for await (const chunk of stream) {
          if (chunk.type !== "text") continue;

          accumulatedContent += chunk.content;

          setMessages((prev) => {
            const existing = prev.find((m) => m.id === assistantId);
            if (existing) {
              return prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulatedContent } : m
              );
            }
            return [
              ...prev,
              { id: assistantId, role: "assistant" as const, content: accumulatedContent },
            ];
          });
        }

        setIsStreaming(false);
        onCompleteRef.current?.();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setIsStreaming(false);
          return;
        }

        const caughtError = err instanceof Error ? err : new Error(String(err));
        setError(caughtError);
        setIsStreaming(false);
        onErrorRef.current?.(caughtError);
      }
    },
    [api]
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, error, send, stop };
}
