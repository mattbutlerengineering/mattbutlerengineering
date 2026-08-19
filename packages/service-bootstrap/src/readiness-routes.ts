import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { ReadinessResponse } from "@mbe/types";
import { createReadinessTracker, registerStandardChecks } from "@mbe/observability";
import type { StandardChecksOptions } from "@mbe/observability";
import { buildJwksUrl } from "./validate-startup-config.js";

/**
 * Options for the readiness-route factory.
 * Mirrors StandardChecksOptions from @mbe/observability so callers only need one import.
 */
export type ReadinessRoutesOptions = StandardChecksOptions;

// The readiness `auth` check probes the Auth0 JWKS endpoint derived from
// AUTH_AUTHORITY. A malformed AUTH_AUTHORITY is now rejected at boot by
// validateStartupConfig (see create-service-app.ts and ADR-021), so by the time
// this plugin runs the value is already well-formed — here we only build the
// URL. An unset/empty value yields undefined, letting registerStandardChecks
// resolve its own fallback chain (AUTH0_JWKS_URL env var, then AUTH_AUTHORITY
// again, then a dev-tenant default) — that dev-tenant default is refused when
// NODE_ENV=production, failing the auth check with an actionable message
// instead of silently probing an unrelated tenant (#4200).

const readinessSchema = {
  summary: "Service readiness probe",
  description: "Returns 200 when fully initialized, 503 during startup.",
  tags: ["Health"],
  response: {
    200: {
      description: "Service is ready for traffic",
      type: "object",
      properties: {
        ready: { type: "boolean", const: true },
        timestamp: { type: "string", format: "date-time" },
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["ok", "error"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
    503: {
      description: "Service is not ready (still starting or dependency unavailable)",
      type: "object",
      properties: {
        ready: { type: "boolean", const: false },
        timestamp: { type: "string", format: "date-time" },
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["ok", "error"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
};

const readinessRoutesPlugin: FastifyPluginAsync<ReadinessRoutesOptions> = async (fastify, opts) => {
  const readiness = createReadinessTracker();
  registerStandardChecks(readiness, {
    ...opts,
    auth0Url: opts.auth0Url ?? buildJwksUrl(process.env.AUTH_AUTHORITY),
  });

  fastify.get<{ Reply: ReadinessResponse }>(
    "/ready",
    {
      schema: { ...readinessSchema, operationId: "getReady" },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (_request, reply) => {
      const snapshot = await readiness.evaluate();
      const response: ReadinessResponse = {
        ready: snapshot.ready,
        timestamp: snapshot.timestamp,
        checks: snapshot.checks.map((c) => ({
          name: c.name,
          status: c.status,
          ...(c.message ? { message: c.message } : {}),
        })),
      };
      return reply.status(snapshot.ready ? 200 : 503).send(response);
    }
  );
};

export const registerReadinessRoutes = fp(readinessRoutesPlugin, {
  name: "readiness-routes",
  fastify: "5.x",
});
