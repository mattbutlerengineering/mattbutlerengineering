import { Readable } from "node:stream";
import type { preParsingAsyncHookHandler } from "fastify";

// Fastify's own default when no bodyLimit is configured (lib/configValidator.js).
// Used as a fallback only if request.server.initialConfig.bodyLimit is somehow unset.
const DEFAULT_BODY_LIMIT = 1048576;

/**
 * Fastify preParsing hook that captures the untouched request bytes into
 * `request.rawBody` before Fastify's JSON body parser consumes the stream.
 *
 * Needed for HMAC signature verification (e.g. Stripe webhooks): the parser
 * re-encodes the parsed body, and `JSON.stringify(JSON.parse(x))` is not
 * guaranteed to byte-equal `x` (number formatting, key ordering, escaping),
 * so verification must run against these exact bytes, never a reconstruction.
 *
 * Mirrors services/agent/src/lib/verified-webhook.ts's createRawBodyCaptureHook,
 * minus the generic HMAC preHandler — Stripe verifies via its own SDK
 * (`stripe.webhooks.constructEvent`), whose header format differs from that
 * module's `raw`/`sha256=` options, so only the raw-capture piece is reused.
 *
 * Buffers against `bodyLimit` as bytes arrive, not just via a post-hoc
 * Content-Length check — Fastify's built-in bodyLimit enforcement runs on the
 * stream this hook *returns*, i.e. after buffering already happened here, so
 * without an inline cap this route would fully buffer an arbitrarily large,
 * unauthenticated request body in memory before any limit is ever checked
 * (worse: undetectable via Content-Length alone under chunked transfer
 * encoding, since there's no header to check).
 */
export function createRawBodyCaptureHook(): preParsingAsyncHookHandler {
  return async (request, _reply, payload) => {
    const limit = request.server.initialConfig.bodyLimit ?? DEFAULT_BODY_LIMIT;
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of payload) {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
      total += buf.length;
      if (total > limit) {
        throw Object.assign(new Error("Request body exceeds the configured size limit"), {
          statusCode: 413,
          code: "FST_ERR_CTP_BODY_TOO_LARGE",
        });
      }
      chunks.push(buf);
    }
    const rawBody = Buffer.concat(chunks);
    request.rawBody = rawBody;
    return Readable.from(rawBody);
  };
}

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}
