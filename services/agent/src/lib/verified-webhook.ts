import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import type { preHandlerHookHandler, preParsingAsyncHookHandler } from "fastify";
import { createProblemDetails } from "@mbe/types";

export interface VerifiedWebhookOptions {
  header: string;
  secretEnv: string;
  format: "raw" | "sha256=";
}

declare module "fastify" {
  interface FastifyRequest {
    verifiedBody: Buffer;
  }
}

const kRawBody = Symbol("verifiedWebhook:rawBody");

/**
 * Creates a preParsing hook that captures raw request bytes.
 * Stashes the raw body so the preHandler can verify it.
 */
export function createRawBodyCaptureHook(): preParsingAsyncHookHandler {
  return async (request, _reply, payload) => {
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
    }
    const rawBody = Buffer.concat(chunks);
    (request as unknown as Record<string | symbol, unknown>)[kRawBody] = rawBody;
    return Readable.from(rawBody);
  };
}

/**
 * Creates an HMAC verification preHandler hook.
 * Verifies the signature from the configured header against the raw body
 * captured by createRawBodyCaptureHook. Sets request.verifiedBody on success.
 * Short-circuits with 401 on failure.
 */
export function createVerifiedBodyPreHandler(opts: VerifiedWebhookOptions): preHandlerHookHandler {
  return async (request, reply) => {
    const secret = process.env[opts.secretEnv];
    if (!secret) {
      request.log.warn(`${opts.secretEnv} not configured — rejecting webhook`);
      return reply
        .code(401)
        .send(createProblemDetails(401, "Unauthorized", "Webhook secret not configured"));
    }

    const signature = request.headers[opts.header] as string | undefined;
    if (!signature) {
      return reply
        .code(401)
        .send(createProblemDetails(401, "Unauthorized", "Missing webhook signature"));
    }

    const rawBody = (request as unknown as Record<string | symbol, unknown>)[kRawBody] as
      | Buffer
      | undefined;
    if (!rawBody) {
      return reply.code(401).send(createProblemDetails(401, "Unauthorized", "Missing raw body"));
    }

    const expected =
      opts.format === "sha256="
        ? `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`
        : createHmac("sha256", secret).update(rawBody).digest("hex");

    if (expected.length !== signature.length) {
      return reply
        .code(401)
        .send(createProblemDetails(401, "Unauthorized", "Invalid webhook signature"));
    }

    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return reply
        .code(401)
        .send(createProblemDetails(401, "Unauthorized", "Invalid webhook signature"));
    }

    request.verifiedBody = rawBody;
  };
}
