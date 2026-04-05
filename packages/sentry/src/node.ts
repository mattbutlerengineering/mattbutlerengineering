import * as Sentry from "@sentry/node";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { resolveConfig } from "./config.js";

export interface InitOptions {
  readonly serviceName: string;
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
  scope.setTag("requestId", (request as any).requestId ?? "unknown");

  const user = (request as any).user;
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

    // 2. Response Hook for status-based logging (catches manual code(4xx).send())
    fastify.addHook("onResponse", async (request, reply) => {
      const status = reply.statusCode;
      if (status >= 400) {
        if (status >= 500) {
            Sentry.withScope((scope) => {
                setSentryContext(scope, request);
                scope.setLevel("error");
                Sentry.captureMessage(`HTTP ${status}: ${request.method} ${request.url}`);
            });
        } else if (status >= 400) {
            // 4xx are warnings or info
            Sentry.withScope((scope) => {
                setSentryContext(scope, request);
                scope.setLevel("warning");
                Sentry.captureMessage(`HTTP ${status}: ${request.method} ${request.url}`);
            });
        }
      }
    });
  },
  { name: "sentry-error-handler" }
);
