import { useState, useRef, useCallback } from "react";
import { flatToTree } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { useAuth } from "@mbe/auth/react";

// FlatElement is the element type consumed by flatToTree. We derive it from the
// function signature rather than importing from @json-render/core (not a direct dep).
type FlatElement = Parameters<typeof flatToTree>[0][number];

export interface UseGenStreamOptions {
  api: string;
  onComplete?: (spec: Spec, rawLines: string[]) => void;
  onError?: (error: Error) => void;
}

export interface UseGenStreamReturn {
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
  rawLines: string[];
  send: (prompt: string, context?: Record<string, unknown>) => Promise<void>;
  clear: () => void;
  stop: () => void;
}

/**
 * Custom streaming hook that mirrors the UseUIStreamReturn interface from
 * @json-render/react but injects the Auth0 Bearer token into the fetch
 * request, and adds a stop() function for aborting in-flight streams.
 *
 * Why not use useUIStream directly: The hook does a plain fetch() with no
 * auth header customization. The backend requires JWT auth, so the token
 * MUST be in the Authorization header.
 */
export function useGenStream({
  api,
  onComplete,
  onError,
}: UseGenStreamOptions): UseGenStreamReturn {
  const { accessToken } = useAuth();

  const [spec, setSpec] = useState<Spec | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rawLines, setRawLines] = useState<string[]>([]);

  // Store AbortController in ref so it persists across renders
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use stable refs for callbacks to avoid re-creating send on every render
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const send = useCallback(
    async (prompt: string, context?: Record<string, unknown>): Promise<void> => {
      // Abort any in-flight request
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Reset state
      setIsStreaming(true);
      setError(null);
      setRawLines([]);
      setSpec(null);

      const accumulatedElements: FlatElement[] = [];
      // Track raw lines locally to avoid stale React state in onComplete callback
      const accumulatedRawLines: string[] = [];

      try {
        const response = await fetch(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ prompt, context }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error("Response body is not readable");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines from the buffer
          const lines = buffer.split("\n");
          // Keep the last (possibly incomplete) chunk in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            accumulatedRawLines.push(trimmed);
            setRawLines((prev) => [...prev, trimmed]);

            try {
              const parsed = JSON.parse(trimmed) as Record<string, unknown>;

              // Treat as a flat element; cast to FlatElement for spec assembly
              accumulatedElements.push(parsed as unknown as FlatElement);
              const updatedSpec = flatToTree([...accumulatedElements]);
              setSpec(updatedSpec);
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // Process any remaining buffered content
        if (buffer.trim()) {
          const trimmedBuffer = buffer.trim();
          accumulatedRawLines.push(trimmedBuffer);
          setRawLines((prev) => [...prev, trimmedBuffer]);
          try {
            const parsed = JSON.parse(trimmedBuffer) as Record<string, unknown>;
            accumulatedElements.push(parsed as unknown as FlatElement);
            const finalSpec = flatToTree([...accumulatedElements]);
            setSpec(finalSpec);
          } catch {
            // Skip malformed JSON lines
          }
        }

        // Build the final spec and notify completion — pass local rawLines array
        // to avoid stale closure pitfall (React state may not reflect latest lines)
        const finalSpec = accumulatedElements.length > 0 ? flatToTree(accumulatedElements) : null;
        if (finalSpec) {
          onCompleteRef.current?.(finalSpec, accumulatedRawLines);
        }

        setIsStreaming(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Abort is intentional (user clicked stop) — keep partial spec, no error
          setIsStreaming(false);
          return;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setIsStreaming(false);
        onErrorRef.current?.(error);
      }
    },
    [api, accessToken]
  );

  const clear = useCallback(() => {
    setSpec(null);
    setError(null);
    setRawLines([]);
  }, []);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { spec, isStreaming, error, rawLines, send, clear, stop };
}
