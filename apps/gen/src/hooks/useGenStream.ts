import { useState, useRef, useCallback, useEffect } from "react";
import { flatToTree } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { useAuth } from "@mbe/auth/react";
import { streamNDJSON } from "@mbe/api-client/streaming";

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

/** Blocked prop keys for XSS prevention (CONTENT-01). */
const BLOCKED_PROP_KEYS = new Set(["dangerouslySetInnerHTML", "ref"]);

/**
 * Sanitize parsed element props to prevent XSS (CONTENT-01).
 * Returns a new object with dangerous keys removed.
 */
function sanitizeProps(parsed: Record<string, unknown>): Record<string, unknown> {
  if (!parsed.props || typeof parsed.props !== "object") return parsed;

  const props = parsed.props as Record<string, unknown>;
  const safeProps: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!key.startsWith("on") && !BLOCKED_PROP_KEYS.has(key)) {
      safeProps[key] = props[key];
    }
  }
  return { ...parsed, props: safeProps };
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

  // Use stable refs for callbacks to avoid re-creating send on every render.
  // Sync via useEffect — writing ref.current in render body violates
  // react-hooks/refs and React's render-purity rules. Mirrors the canonical
  // fix in packages/rialto/src/components/GenCopilot/useGenCopilotStream.ts.
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
        const stream = streamNDJSON<Record<string, unknown>>({
          url: api,
          body: { prompt, context },
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          signal: controller.signal,
        });

        for await (const parsed of stream) {
          const sanitized = sanitizeProps(parsed);
          const rawLine = JSON.stringify(sanitized);

          accumulatedRawLines.push(rawLine);
          setRawLines((prev) => [...prev, rawLine]);

          // Treat as a flat element; cast to FlatElement for spec assembly
          accumulatedElements.push(sanitized as unknown as FlatElement);
          const updatedSpec = flatToTree([...accumulatedElements]);
          setSpec(updatedSpec);
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
