import { useState, useRef, useCallback } from "react";
import { flatToTree } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { streamNDJSON } from "@mbe/api-client/streaming";
import type { DomainContext } from "./GenCopilot.js";

// FlatElement is the element type consumed by flatToTree. We derive it from the
// function signature rather than importing from @json-render/core (not a direct dep).
type FlatElement = Parameters<typeof flatToTree>[0][number];

export interface UseGenCopilotStreamOptions {
  api: string;
  domainContext: DomainContext;
  getAccessToken: () => string | null | Promise<string | null>;
  onComplete?: (spec: Spec) => void;
  onError?: (error: Error) => void;
}

export interface UseGenCopilotStreamReturn {
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
  send: (prompt: string) => Promise<void>;
  stop: () => void;
}

/**
 * Serializes domain context schemas into a text prefix prepended to the user prompt.
 * Gives the AI model context about the data structures available in the app.
 */
function buildPromptWithContext(userPrompt: string, domainContext: DomainContext): string {
  const schemasText = domainContext.schemas
    .map((schema) => {
      return `### ${schema.name}\n${schema.description}\nAvailable fields: ${schema.fields}`;
    })
    .join("\n\n");

  return `You are generating UI for a hospitality management app. Use these data schemas:\n\n${schemasText}\n\nUser request: ${userPrompt}`;
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
 * Auth-decoupled streaming hook adapted from useGenStream.
 * Accepts getAccessToken prop instead of calling useAuth() directly,
 * enabling use inside @mbe/rialto without depending on @mbe/auth.
 *
 * Prepends domain context schemas to the prompt before POSTing.
 * Returns only the subset of state needed for the copilot panel.
 */
export function useGenCopilotStream({
  api,
  domainContext,
  getAccessToken,
  onComplete,
  onError,
}: UseGenCopilotStreamOptions): UseGenCopilotStreamReturn {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Store AbortController in ref so it persists across renders
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use stable refs for callbacks to avoid re-creating send on every render
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Store getAccessToken in ref so send() closure doesn't become stale
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  const domainContextRef = useRef(domainContext);
  domainContextRef.current = domainContext;

  const send = useCallback(
    async (userPrompt: string): Promise<void> => {
      // Abort any in-flight request
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Reset state
      setIsStreaming(true);
      setError(null);
      setSpec(null);

      const accumulatedElements: FlatElement[] = [];

      try {
        const token = await Promise.resolve(getAccessTokenRef.current());
        const prompt = buildPromptWithContext(userPrompt, domainContextRef.current);

        const stream = streamNDJSON<Record<string, unknown>>({
          url: api,
          body: { prompt },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });

        for await (const parsed of stream) {
          const sanitized = sanitizeProps(parsed);

          // Treat as a flat element; cast to FlatElement for spec assembly
          accumulatedElements.push(sanitized as unknown as FlatElement);
          const updatedSpec = flatToTree([...accumulatedElements]);
          setSpec(updatedSpec);
        }

        // Build the final spec and notify completion
        const finalSpec = accumulatedElements.length > 0 ? flatToTree(accumulatedElements) : null;
        if (finalSpec) {
          onCompleteRef.current?.(finalSpec);
        }

        setIsStreaming(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Abort is intentional (user clicked stop) — keep partial spec, no error
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

  return { spec, isStreaming, error, send, stop };
}
