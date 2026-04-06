import * as Sentry from "@sentry/node";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { resolveConfig } from "./config.js";

/**
 * Minimal user shape expected by Sentry context.
 * The actual `request.user` is populated by @mbe/auth's Fastify plugin at runtime
 * and typed via module augmentation in consuming services.
 */
interface SentryUser {
  readonly id: string;
  readonly email?: string;
}

/**
 * Type guard: checks whether an unknown value conforms to the SentryUser shape.
 */
function isSentryUser(value: unknown): value is SentryUser {
  return (
    value != null &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as SentryUser).id === "string"
  );
}

/**
 * Safely extracts user from request without depending on @mbe/auth types.
 * At runtime, request.user is set by the auth plugin when a valid JWT is present.
 */
function getRequestUser(request: FastifyRequest): SentryUser | undefined {
  // The user property is added at runtime by @mbe/auth's Fastify plugin.
  // We extract it through an intersection type to avoid module augmentation conflicts.
  const { user } = request as FastifyRequest & { user?: unknown };
  return isSentryUser(user) ? user : undefined;
}

export interface InitOptions {
  readonly serviceName: string;
}

/** Marker added to reply after error handler captures the exception. */
interface SentryReplyMeta {
  readonly __sentryErrorCaptured?: boolean;
}

export function initSentry(options: InitOptions): void {
  const config = resolveConfig(process.env.SENTRY_DSN);
  if (!config.enabled) {
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    serverName: options.serviceName,
    skipOpenTelemetrySetup: true,
    tracesSampleRate: 0,
  });
}

/**
 * Attaches request metadata and user context to Sentry scope.
 */
function setSentryContext(scope: Sentry.Scope, request: FastifyRequest): void {
  scope.setTag("method", request.method);
  scope.setTag("url", request.url);
  scope.setTag("requestId", request.id ?? "unknown");

  const user = getRequestUser(request);
  if (user?.id) {
    scope.setUser({ id: user.id, email: user.email });
  }
}

export const sentryFastifyPlugin = fp(
  async function sentryPlugin(fastify: FastifyInstance) {
    const config = resolveConfig(process.env.SENTRY_DSN);
    if (!config.enabled) {
      return;
    }

    // 1. Explicit Error Handler
    fastify.setErrorHandler(
      (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
        Sentry.withScope((scope) => {
          setSentryContext(scope, request);
          scope.setTag("handled", "true");
          Sentry.captureException(error);
        });

        // Flag reply so onResponse hook doesn't double-capture this error
        (reply as unknown as Record<string, unknown>).__sentryErrorCaptured = true;

        const statusCode = error.statusCode ?? 500;
        
        // If it's a 500, we obscure the message for the client but log the real one
        const title = error.name || "Internal Server Error";
        const message = statusCode >= 500 ? "Internal Server Error" : error.message;

        reply.status(statusCode).send(
          createProblemDetails(
            statusCode,
            title,
            message,
            "about:blank",
            request.url
          )
        );
      }
    );

    // 4xx statuses that indicate unexpected server-side issues worth tracking
    const NOTABLE_4XX = new Set([409, 422, 429]);

    // 2. Response Hook for status-based logging (catches manual code(4xx).send())
    fastify.addHook("onResponse", async (request, reply) => {
      const status = reply.statusCode;

      if (status >= 500 && !(reply as unknown as SentryReplyMeta).__sentryErrorCaptured) {
        // Only capture 5xx if not already captured by the error handler
        Sentry.withScope((scope) => {
          setSentryContext(scope, request);
          scope.setLevel("error");
          Sentry.captureMessage(`HTTP ${status}: ${request.method} ${request.url}`);
        });
      } else if (status >= 400 && status < 500 && NOTABLE_4XX.has(status)) {
        // Only capture notable 4xx — skip expected client errors (400, 401, 403, 404)
        Sentry.withScope((scope) => {
          setSentryContext(scope, request);
          scope.setLevel("warning");
          Sentry.captureMessage(`HTTP ${status}: ${request.method} ${request.url}`);
        });
      }
    });
  },
  { name: "sentry-error-handler" }
);
