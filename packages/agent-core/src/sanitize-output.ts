/**
 * HTML entity escaping and stream chunk sanitization for AI-generated output.
 *
 * Prevents XSS (OWASP LLM02) by escaping HTML entities in streamed text
 * before it reaches clients.
 */

/** Fields in NDJSON objects that may contain AI-generated text needing sanitization. */
const TEXT_FIELDS = ["text", "content", "message"] as const;

/**
 * Escape HTML entities in a string to prevent XSS when rendered in browsers.
 *
 * Escapes: & < > " '
 */
export function escapeHtml(text: string): string {
  if (text.length === 0) return text;

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Sanitize a streamed chunk of AI output.
 *
 * - For NDJSON chunks (valid JSON lines): parses the JSON, escapes HTML in
 *   known text fields (text, content, message), and re-serializes.
 * - For plain text chunks: escapes all HTML entities.
 *
 * Returns a new string — never mutates the input.
 */
export function sanitizeStreamChunk(chunk: string): string {
  if (chunk.length === 0) return chunk;

  const trimmed = chunk.trim();

  // Non-JSON content: escape the whole thing
  if (trimmed.length === 0 || trimmed[0] !== "{") {
    return escapeHtml(chunk);
  }

  // Attempt NDJSON parse
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Malformed JSON — fall back to full escaping
    return escapeHtml(chunk);
  }

  // Build a new object with sanitized text fields (immutable pattern)
  let changed = false;
  const sanitized: Record<string, unknown> = {};

  for (const key of Object.keys(parsed)) {
    const value = parsed[key];
    if (typeof value === "string" && TEXT_FIELDS.includes(key as (typeof TEXT_FIELDS)[number])) {
      const escaped = escapeHtml(value);
      sanitized[key] = escaped;
      if (escaped !== value) changed = true;
    } else {
      sanitized[key] = value;
    }
  }

  // If nothing changed, return original to avoid unnecessary serialization churn
  if (!changed) return chunk;

  return JSON.stringify(sanitized);
}

/**
 * Create a TransformStream that sanitizes each text chunk passing through.
 *
 * Wraps an AI SDK textStream (or any ReadableStream<string>) so that every
 * chunk is HTML-escaped before reaching the client.
 */
export function createSanitizedStream(
  source: ReadableStream<string> | AsyncIterable<string>
): ReadableStream<string> {
  const reader =
    "getReader" in source
      ? source.getReader()
      : readableStreamFromAsyncIterable(source).getReader();

  return new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(escapeHtml(value));
    },
    cancel() {
      reader.cancel();
    },
  });
}

/** Convert an AsyncIterable to a ReadableStream for uniform handling. */
function readableStreamFromAsyncIterable(
  iterable: AsyncIterable<string>
): ReadableStream<string> {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
  });
}
