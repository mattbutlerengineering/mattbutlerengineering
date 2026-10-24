/// <reference types="@fastify/rate-limit" />
import type { FastifyRequest, FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
// Import directly from catalog (not index) to avoid pulling in registry.tsx (browser-only)
import { catalog } from "@mbe/rialto-catalog/catalog";
import type { z } from "zod";
import {
  GEN_MODEL_ID,
  GEN_MAX_OUTPUT_TOKENS,
  logGenCost,
  applyStreamHeaders,
} from "./gen-stream.js";
import { createSanitizedStream } from "@mbe/agent-core";
import { createGenRunner } from "./gen-runner.js";
import {
  genCostMicroUsd,
  getGenDailyCeilingUsd,
  getGenSpendToday,
  failedGenCostMicroUsd,
  isSpendTrackingDegraded,
  secondsUntilNextWindow,
  trackGenSpend,
} from "../services/gen-spend-ceiling.js";
import { genSpecCacheKey, getCachedSpec, putCachedSpec } from "../services/gen-spec-cache.js";
import type { GenToolMap, GenStreamEvent, GenRunnerConfig } from "./gen-runner.js";

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
  /** Overrides the catalog prompt (default: catalog.prompt()). */
  readonly systemPrompt?: string;
  readonly toolChoice?: GenRunnerConfig["toolChoice"];
  readonly failOnToolError?: boolean;
  /**
   * ndjson only: serve identical requests from the Postgres spec cache. Only
   * successful runs are stored; a hit replays the exact lines a miss streamed.
   */
  readonly cache?: boolean;
  /** Derives the chat messages from the parsed body (default: `parsed.messages`). */
  readonly toMessages?: (parsed: z.infer<TSchema>) => GenMessages;
  /**
   * ndjson only: maps an event to the value written as one JSON line.
   * Return undefined to drop the event (default: the event itself).
   */
  readonly serializeEvent?: (event: GenStreamEvent) => unknown;
  /**
   * ndjson only: per-request variant of `serializeEvent`, built from the parsed
   * body so it can hold request-scoped state (and throw to fail the run).
   * Takes precedence over `serializeEvent`.
   */
  readonly createEventSerializer?: (parsed: z.infer<TSchema>) => (event: GenStreamEvent) => unknown;
  readonly getTools: (
    request: FastifyRequest,
    parsed: z.infer<TSchema>
  ) => GenToolMap | Promise<GenToolMap>;
}

type GenMessages = Array<{ role: "user" | "assistant"; content: string }>;

const encoder = new TextEncoder();

/**
 * Client-safe wrapper for a runner failure. The upstream error (e.g. an
 * Anthropic 401 "invalid x-api-key") must not reach the browser or pick the
 * HTTP status, and a <500 would also be skipped by captureRequestError — so
 * answer a generic 502 and keep the original as `cause` for server logging.
 */
function emptyOutputError(): Error & { statusCode: number } {
  return toError(new Error("Generation completed with no output"));
}

function toError(err: unknown): Error & { statusCode: number } {
  return Object.assign(new Error("Generation failed upstream", { cause: err }), {
    statusCode: 502,
  });
}

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
  const defaultSerializeEvent = config.serializeEvent ?? ((event: GenStreamEvent) => event);

  const contentType =
    streamFormat === "text" ? "text/plain; charset=utf-8" : "application/x-ndjson; charset=utf-8";

  return async (fastify) => {
    // Per-identity cap enforced by hand after requireAuth: a route-level
    // `config.rateLimit` runs at onRequest, before request.user exists, so its
    // keyGenerator always fell back to the IP. createRateLimit bypasses the
    // plugin's one-limiter-per-request flag, so the service-wide limiter keeps
    // covering the anonymous surface.
    const identityLimiter = fastify.createRateLimit({
      max: rateLimit.max,
      timeWindow: rateLimit.timeWindow,
      keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
    });

    const enforceIdentityLimit: preHandlerAsyncHookHandler = async (request, reply) => {
      const limit = await identityLimiter(request);
      if (limit.isAllowed || !limit.isExceeded) return;

      reply.header("Retry-After", limit.ttlInSeconds);
      return reply
        .code(429)
        .send(
          createProblemDetails(
            429,
            "Too Many Requests",
            `Rate limit exceeded. Retry after ${limit.ttlInSeconds} seconds.`
          )
        );
    };

    // Aggregate ceiling across ALL identities, ordered after requireAuth and the
    // identity limiter so anonymous and per-user refusals keep their own answers.
    // Distinct problem type: a service-wide stop is not a per-user rate limit.
    const enforceSpendCeiling: preHandlerAsyncHookHandler = async (request, reply) => {
      const ceilingUsd = getGenDailyCeilingUsd();
      const ceilingMicroUsd = Math.round(ceilingUsd * 1_000_000);
      const retryAfter = secondsUntilNextWindow();

      let spend;
      try {
        if (isSpendTrackingDegraded()) throw new Error("usage writes are failing");
        spend = await getGenSpendToday();
      } catch (err) {
        // Unknown spend must not read as zero spend: fail closed.
        request.log.error({ err }, "gen spend ceiling: counter unreadable, refusing");
        reply.header("Retry-After", retryAfter);
        return reply
          .code(503)
          .send(
            createProblemDetails(
              503,
              "Service Unavailable",
              "Generation is temporarily unavailable.",
              "urn:mbe:problem:gen-spend-ceiling-unavailable"
            )
          );
      }

      if (spend.costMicroUsd < ceilingMicroUsd) return;

      request.log.warn(
        {
          window: new Date().toISOString().slice(0, 10),
          ceilingUsd,
          accumulatedUsd: spend.costMicroUsd / 1_000_000,
          generations: spend.generations,
        },
        "gen spend ceiling reached, refusing generation"
      );
      reply.header("Retry-After", retryAfter);
      return reply
        .code(503)
        .send(
          createProblemDetails(
            503,
            "Service Spend Ceiling Reached",
            `The service's daily generation ceiling has been reached. Retry after ${retryAfter} seconds.`,
            "urn:mbe:problem:gen-spend-ceiling-reached"
          )
        );
    };

    fastify.post(
      path,
      {
        preHandler: [requireAuth, enforceIdentityLimit, enforceSpendCeiling],
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
        const messages = config.toMessages
          ? config.toMessages(parsed)
          : (parsed as { messages: GenMessages }).messages;

        const systemPrompt = config.systemPrompt ?? SYSTEM_PROMPT;
        const cacheKey =
          config.cache && streamFormat === "ndjson"
            ? genSpecCacheKey({
                route: path,
                messages,
                modelId: GEN_MODEL_ID,
                systemPrompt,
                maxOutputTokens: GEN_MAX_OUTPUT_TOKENS,
              })
            : undefined;

        if (cacheKey) {
          // Cache trouble must never fail a request: fall through to the model.
          const cached = await getCachedSpec(cacheKey).catch((err: unknown) => {
            request.log.warn({ err }, "gen spec cache read failed");
            return null;
          });
          if (cached) {
            applyStreamHeaders(reply, contentType);
            return reply.send(
              new ReadableStream({
                start(controller) {
                  for (const line of cached) {
                    controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
                  }
                  controller.close();
                },
              })
            );
          }
        }

        const tools = await getTools(request, parsed);
        // A run that errors before onFinish still consumed tokens: charge the worst case.
        let usageReported = false;
        const chargeIfUnreported = async () => {
          if (!usageReported) await trackGenSpend(failedGenCostMicroUsd(), request.log);
        };
        const runner = createGenRunner({
          systemPrompt,
          modelId: GEN_MODEL_ID,
          maxOutputTokens: GEN_MAX_OUTPUT_TOKENS,
          maxSteps,
          toolChoice: config.toolChoice,
          failOnToolError: config.failOnToolError,
          onFinish: async ({ usage, providerMetadata }) => {
            logGenCost(request.log, {
              userId: request.user?.id,
              usage,
              providerMetadata,
              label: costLogLabel,
            });
            usageReported = true;
            await trackGenSpend(genCostMicroUsd(usage, providerMetadata), request.log);
          },
        });

        applyStreamHeaders(reply, contentType);

        if (streamFormat === "text") {
          const textStream = new ReadableStream<string>({
            async start(controller) {
              let emitted = false;
              try {
                await runner.run(messages, tools, async (event) => {
                  if (event.type === "text" && event.content.length > 0) {
                    emitted = true;
                    controller.enqueue(event.content);
                  }
                });
                if (!emitted) throw emptyOutputError();
                controller.close();
              } catch (err) {
                // Error the stream — closing here would turn an upstream
                // failure (e.g. 529/401) into an empty-looking 200.
                request.log.error({ err }, "gen stream failed");
                await chargeIfUnreported();
                controller.error(toError(err));
              }
            },
          });
          return reply.send(createSanitizedStream(textStream));
        }

        // ndjson: encode each event as a JSON line
        const serializeEvent = config.createEventSerializer?.(parsed) ?? defaultSerializeEvent;
        const ndjsonStream = new ReadableStream({
          async start(controller) {
            let emitted = false;
            const lines: unknown[] = [];
            try {
              await runner.run(messages, tools, async (event) => {
                const line = serializeEvent(event);
                if (line === undefined) return;
                emitted = true;
                lines.push(line);
                controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
              });
              if (!emitted) throw emptyOutputError();
              // Only a run that finished cleanly reaches here: errors and the
              // maxOutputTokens truncation both throw out of runner.run above.
              if (cacheKey) {
                await putCachedSpec(cacheKey, lines).catch((err: unknown) => {
                  request.log.warn({ err }, "gen spec cache write failed");
                });
              }
              controller.close();
            } catch (err) {
              request.log.error({ err }, "gen stream failed");
              await chargeIfUnreported();
              controller.error(toError(err));
            }
          },
        });
        return reply.send(ndjsonStream);
      }
    );
  };
}
