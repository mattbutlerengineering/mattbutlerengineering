import { useState, useRef, useCallback } from "react";
import { flatToTree } from "@json-render/react";
import type { Spec } from "@json-render/react";
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

        const response = await fetch(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ prompt }),
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

            try {
              const parsed = JSON.parse(trimmed) as Record<string, unknown>;

              // Skip usage metadata lines — copilot doesn't expose usage to UI
              if (parsed.type === "usage") {
                continue;
              }

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
          try {
            const parsed = JSON.parse(buffer.trim()) as Record<string, unknown>;
            if (parsed.type !== "usage") {
              accumulatedElements.push(parsed as unknown as FlatElement);
              const finalSpec = flatToTree([...accumulatedElements]);
              setSpec(finalSpec);
            }
          } catch {
            // Skip malformed JSON lines
          }
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
