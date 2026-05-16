/**
 * Shared NDJSON streaming utility.
 *
 * Handles raw fetch with ReadableStream, newline-delimited JSON parsing with
 * buffer for incomplete chunks, and proper error propagation. Used by both
 * useGenStream (apps/gen) and useGenCopilotStream (packages/rialto).
 */

export interface StreamConfig {
  /** URL to POST to */
  url: string;
  /** Request body (will be JSON-stringified) */
  body: unknown;
  /** Extra headers merged with Content-Type and Authorization */
  headers?: Record<string, string>;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Stream NDJSON from a POST endpoint, yielding one parsed object per line.
 *
 * Callers are responsible for:
 * - Building the request body
 * - Handling AbortError (partial results are fine)
 * - Domain-specific processing of each yielded object
 *
 * @example
 * ```ts
 * for await (const obj of streamNDJSON<MyType>({ url, body, signal })) {
 *   // process each line
 * }
 * ```
 */
export async function* streamNDJSON<T>(config: StreamConfig): AsyncGenerator<T> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...config.headers,
    },
    body: JSON.stringify(config.body),
    signal: config.signal,
  });

  if (!response.ok) {
    let detail = response.statusText || `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail =
        ((body as Record<string, unknown>).detail as string) ??
        ((body as Record<string, unknown>).message as string) ??
        detail;
    } catch {
      // Response body is not JSON — use status text
    }
    throw new Error(`Request failed: ${detail}`);
  }

  if (!response.body) {
    throw new Error("Response body is not readable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
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
          const parsed = JSON.parse(trimmed) as T;
          yield parsed;
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Process any remaining buffered content
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim()) as T;
        yield parsed;
      } catch {
        // Skip malformed JSON lines
      }
    }
  } finally {
    reader.releaseLock();
  }
}
