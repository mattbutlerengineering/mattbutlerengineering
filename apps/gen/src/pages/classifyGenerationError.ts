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
export function isTransportError(error: Error): boolean {
  return (
    error instanceof TypeError ||
    error.message.startsWith("Request failed:") ||
    error.message === "Response body is not readable"
  );
}
