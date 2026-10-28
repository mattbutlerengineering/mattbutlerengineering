/**
 * Distinguishes a transport/HTTP failure (auth expired, not found, dropped
 * connection) from a generation/validation failure (the model produced
 * something invalid) for the two places that care: "retry with error
 * context" should only feed the error back to the model for the latter —
 * resending a plain prompt after a 401 or a network drop doesn't help — and
 * a "Failed:" history entry is only meaningful for an actual generation
 * failure, not an infrastructure hiccup.
 *
 * `streamNDJSON` (packages/api-client/src/streaming.ts) doesn't preserve the
 * HTTP status code on the Error it throws — only a human-readable detail
 * string, always prefixed "Request failed: " for any non-2xx response, or
 * "Response body is not readable" if the body can't be read at all. A raw
 * network failure (fetch() itself rejecting — offline, DNS, CORS) throws a
 * TypeError instead. Those are the only signals available client-side.
 */
/** A gateway timeout (HTTP 504). The prompt should stay, and the attempt is worth recording. */
export function isTimeoutError(error: Error): boolean {
  return statusOf(error) === 504;
}

export function describeTimeoutError(error: Error): string | null {
  if (!isTimeoutError(error)) return null;
  return "Generation timed out before a UI came back. Your prompt is still in the box — try again, or ask for something smaller.";
}

export function isTransportError(error: Error): boolean {
  return (
    error instanceof TypeError ||
    statusOf(error) !== undefined ||
    error.message.startsWith("Request failed:") ||
    error.message === "Response body is not readable"
  );
}

const CEILING_REACHED = "urn:mbe:problem:gen-spend-ceiling-reached";
const CEILING_UNAVAILABLE = "urn:mbe:problem:gen-spend-ceiling-unavailable";

// Structural read: StreamRequestError (@mbe/api-client/streaming) carries
// these fields; duck-typing keeps this module free of that import.
function statusOf(error: Error): number | undefined {
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function minutesLabel(seconds: number | undefined): string {
  const minutes = Math.max(1, Math.ceil((seconds ?? 60) / 60));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * User-facing copy for the server's usage limits, classified by HTTP status
 * and RFC 7807 problem type (never message text): the per-user 429, and the
 * two service-wide spend-ceiling 503s. Returns null for any other failure so
 * callers keep the generic error.
 */
export function describeLimitError(error: Error): string | null {
  const status = statusOf(error);
  const { problemType, retryAfterSeconds } = error as {
    problemType?: string;
    retryAfterSeconds?: number;
  };
  if (status === 429) {
    return `You've sent too many requests. Try again in about ${minutesLabel(retryAfterSeconds)}.`;
  }
  if (status === 503 && problemType === CEILING_REACHED) {
    return "The daily budget for generation has been reached. Come back tomorrow.";
  }
  if (status === 503 && problemType === CEILING_UNAVAILABLE) {
    return "Generation is temporarily unavailable. Please try again shortly.";
  }
  return null;
}
