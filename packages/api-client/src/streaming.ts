/**
 * Shared NDJSON streaming utility.
 *
 * Handles raw fetch with ReadableStream, newline-delimited JSON parsing with
 * buffer for incomplete chunks, and proper error propagation. Used by both
 * useGenStream (apps/gen) and useChatStream (packages/rialto).
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
 * Thrown for any non-2xx response. The message keeps the historical
 * "Request failed: <detail>" form; the structured fields let callers classify
 * by HTTP status / RFC 7807 problem type instead of sniffing message text.
 */
export class StreamRequestError extends Error {
  readonly status: number;
  readonly problemType?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    fields: { status: number; problemType?: string; retryAfterSeconds?: number }
  ) {
    super(message);
    this.name = "StreamRequestError";
    this.status = fields.status;
    this.problemType = fields.problemType;
    this.retryAfterSeconds = fields.retryAfterSeconds;
  }
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
function throwIfGenError(parsed: unknown): void {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return;
  const message = (parsed as { $genError?: unknown }).$genError;
  if (typeof message !== "string" || message === "") return;
  // A plain Error, not a transport status: the prompt stays and the attempt
  // is a generation failure the history can record.
  const error = new Error(message);
  error.name = "GenStreamError";
  throw error;
}

function isGenStreamError(error: unknown): boolean {
  return error instanceof Error && error.name === "GenStreamError";
}

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
    let problemType: string | undefined;
    try {
      const body = (await response.json()) as Record<string, unknown>;
      detail = (body.detail as string) ?? (body.message as string) ?? detail;
      if (typeof body.type === "string") problemType = body.type;
    } catch {
      // Response body is not JSON — use status text
    }
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new StreamRequestError(`Request failed: ${detail}`, {
      status: response.status,
      problemType,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
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
          throwIfGenError(parsed);
          yield parsed;
        } catch (error) {
          if (error instanceof StreamRequestError || isGenStreamError(error)) throw error;
          // Skip malformed JSON lines
        }
      }
    }

    // Process any remaining buffered content
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim()) as T;
        throwIfGenError(parsed);
        yield parsed;
      } catch (error) {
        if (error instanceof StreamRequestError || isGenStreamError(error)) throw error;
        // Skip malformed JSON lines
      }
    }
  } finally {
    reader.releaseLock();
  }
}
