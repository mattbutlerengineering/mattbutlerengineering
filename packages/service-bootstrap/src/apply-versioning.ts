import type { FastifyInstance, FastifyReply } from "fastify";

/**
 * API versioning configuration.
 *
 * Governs the successor computation, sunset headers, and deprecation decorators
 * described in ADR-002 (API versioning strategy).
 *
 * History: originally in a separate @mbe/api-versioning package, collapsed into
 * createServiceApp via PR #1656 (commit 6241fa3f). This module re-gives the
 * policy a dedicated name and test surface without resurrecting the package.
 */
export interface ApiVersioningConfig {
  readonly currentVersion: string;
  readonly successorVersion?: string;
  readonly sunsetMonthsFromNow?: number;
}

/**
 * Computes the RFC 8594 sunset date as a UTC string.
 */
function computeSunsetDate(monthsFromNow: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsFromNow);
  return date.toUTCString();
}

/**
 * Applies API versioning policy to a Fastify instance:
 * - Adds `API-Version` header to every response
 * - Adds `Link; rel="successor-version"` header to every response (when successorVersion is set)
 * - Decorates the instance with `apiVersion`, `successorVersion`, `sunsetDate`
 * - Decorates the instance with `addDeprecationHeaders(reply)` for route-level deprecation
 *
 * Called by createServiceApp — the inlined block in that function delegates here.
 */
export function applyVersioning(
  fastify: FastifyInstance,
  config?: Partial<ApiVersioningConfig>
): void {
  const { currentVersion = "v1", sunsetMonthsFromNow = 6 } = config ?? {};

  // Auto-compute successor (e.g. v1 → v2) unless the caller explicitly
  // provides successorVersion (including undefined to opt out of the Link header).
  const successorVersion =
    "successorVersion" in (config ?? {})
      ? config!.successorVersion
      : (() => {
          const match = currentVersion.match(/^v(\d+)$/);
          return match ? `v${parseInt(match[1], 10) + 1}` : undefined;
        })();

  const sunsetDate = computeSunsetDate(sunsetMonthsFromNow);

  fastify.addHook("onSend", async (request, reply) => {
    reply.header("API-Version", currentVersion);
    if (successorVersion) {
      const path = request.url.replace(/\/v\d+/, `/${successorVersion}`);
      reply.header("Link", `<${path}>; rel="successor-version"`);
    }
  });

  fastify.decorate("addDeprecationHeaders", (reply: FastifyReply) => {
    reply.header("Deprecation", "true");
    reply.header("Sunset", sunsetDate);
    if (successorVersion) {
      const path = reply.request.url.replace(/\/v\d+/, `/${successorVersion}`);
      reply.header("Link", `<${path}>; rel="successor-version"`);
    }
  });

  fastify.decorate("apiVersion", currentVersion);
  fastify.decorate("successorVersion", successorVersion);
  fastify.decorate("sunsetDate", sunsetDate);
}

declare module "fastify" {
  interface FastifyInstance {
    apiVersion: string;
    successorVersion?: string;
    sunsetDate: string;
    addDeprecationHeaders: (reply: FastifyReply) => void;
  }
}
