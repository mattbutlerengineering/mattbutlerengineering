/// <reference types="@fastify/rate-limit" />
import type { FastifyRequest, FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
// Import directly from catalog (not index) to avoid pulling in registry.tsx (browser-only)
import { catalog } from "@mbe/rialto-catalog/catalog";
import type { z } from "zod";
import { GEN_MODEL_ID, logGenCost, applyStreamHeaders } from "./gen-stream.js";
import { createSanitizedStream } from "@mbe/agent-core";
import { createGenRunner } from "./gen-runner.js";
import type { GenToolMap } from "./gen-runner.js";

// Memoize catalog prompt at module load — avoid re-generating per request
const SYSTEM_PROMPT = catalog.prompt();

export interface GenRouteConfig<TSchema extends z.ZodType> {
  readonly path: string;
  /** Exact label passed to logGenCost — preserved per-route for log-query stability. */
  readonly costLogLabel: string;
  readonly rateLimit: { readonly max: number; readonly timeWindow: string };
  readonly schema: TSchema;
  /** "text" → text/plain passthrough; "ndjson" → application/x-ndjson line framing */
  readonly streamFormat: "text" | "ndjson";
  readonly maxSteps: number;
  readonly getTools: (
    request: FastifyRequest,
    parsed: z.infer<TSchema>
  ) => GenToolMap | Promise<GenToolMap>;
}

const encoder = new TextEncoder();

/**
 * Factory for gen streaming routes. Owns: Zod parsing + 400 error, auth preHandler,
 * stream headers, protocol framing (text/plain or NDJSON), and cost logging.
 *
 * A route declaration becomes:
 *   fastify.register(createGenRoute({ path, rateLimit, schema, streamFormat, maxSteps, getTools }))
 */
export function createGenRoute<TSchema extends z.ZodType>(
  config: GenRouteConfig<TSchema>
): FastifyPluginAsync {
  const { path, costLogLabel, rateLimit, schema, streamFormat, maxSteps, getTools } = config;

  const contentType =
    streamFormat === "text" ? "text/plain; charset=utf-8" : "application/x-ndjson; charset=utf-8";

  return async (fastify) => {
    fastify.post(
      path,
      {
        preHandler: [requireAuth],
        config: {
          rateLimit: {
            max: rateLimit.max,
            timeWindow: rateLimit.timeWindow,
            keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
          },
        },
      },
      async (request, reply) => {
        const parseResult = schema.safeParse(request.body);
        if (!parseResult.success) {
          return reply
            .code(400)
            .send(
              createProblemDetails(
                400,
                "Bad Request",
                (parseResult.error as z.ZodError).issues.map((i) => i.message).join(", ")
              )
            );
        }

        const parsed = parseResult.data;
        const { messages } = parsed as {
          messages: Array<{ role: "user" | "assistant"; content: string }>;
        };

        const tools = await getTools(request, parsed);
        const runner = createGenRunner({
          systemPrompt: SYSTEM_PROMPT,
          modelId: GEN_MODEL_ID,
          maxSteps,
          onFinish: async ({ usage, providerMetadata }) =>
            logGenCost(request.log, {
              userId: request.user?.id,
              usage,
              providerMetadata,
              label: costLogLabel,
            }),
        });

        applyStreamHeaders(reply, contentType);

        if (streamFormat === "text") {
          const textStream = new ReadableStream<string>({
            async start(controller) {
              try {
                await runner.run(messages, tools, async (event) => {
                  if (event.type === "text") {
                    controller.enqueue(event.content);
                  }
                });
              } finally {
                controller.close();
              }
            },
          });
          return reply.send(createSanitizedStream(textStream));
        }

        // ndjson: encode each event as a JSON line
        const ndjsonStream = new ReadableStream({
          async start(controller) {
            try {
              await runner.run(messages, tools, async (event) => {
                controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
              });
            } finally {
              controller.close();
            }
          },
        });
        return reply.send(ndjsonStream);
      }
    );
  };
}
