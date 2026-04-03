import * as Sentry from "@sentry/node";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";
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

export const sentryFastifyPlugin = fp(
  async function sentryPlugin(fastify: FastifyInstance) {
    const config = resolveConfig(process.env.SENTRY_DSN);
    if (!config.enabled) {
      return;
    }

    fastify.setErrorHandler(
      (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
        Sentry.withScope((scope) => {
          scope.setTag("method", request.method);
          scope.setTag("url", request.url);

          const user = (request as unknown as Record<string, unknown>).user as
            | { id?: string; email?: string }
            | undefined;
          if (user?.id) {
            scope.setUser({ id: user.id, email: user.email });
          }

          Sentry.captureException(error);
        });

        const statusCode = error.statusCode ?? 500;
        reply.status(statusCode).send({
          error: error.name ?? "Internal Server Error",
          message: statusCode >= 500 ? "Internal Server Error" : error.message,
          statusCode,
        });
      }
    );
  },
  { name: "sentry-error-handler" }
);
