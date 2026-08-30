import { Readable } from "node:stream";
import type { preParsingAsyncHookHandler } from "fastify";

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
 */
export function createRawBodyCaptureHook(): preParsingAsyncHookHandler {
  return async (request, _reply, payload) => {
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
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
