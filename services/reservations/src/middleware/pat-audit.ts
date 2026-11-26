import type { FastifyInstance, FastifyRequest } from "fastify";
import { AVAILABILITY_CONFIG_PREFIX, createProblemDetails } from "@mbe/types";
import type { Prisma } from "../generated/prisma/index.js";
import { DuplicateConfirmNonceError } from "../services/access-token-audit.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { RESERVATION_ROUTE } from "./pat-auth.js";

const TOOL_HEADER = "mbe-tool";
const NONCE_HEADER = "mbe-confirm-nonce";
const HEADER_MAX_LENGTH = 200;

/** The audit row of each request, so `onResponse` can stamp its status. */
const auditIds = new WeakMap<FastifyRequest, string>();

const headerValue = (request: FastifyRequest, name: string): string | null => {
  const value = request.headers[name];
  return typeof value === "string" && value !== "" ? value.slice(0, HEADER_MAX_LENGTH) : null;
};

/** Routes under the venues prefix address the venue by their own `:id`. */
const VENUE_ROUTE_PREFIX = `${AVAILABILITY_CONFIG_PREFIX}/:id`;

/**
 * The request's venue, else `null` (informational). A reservation is resolved
 * through `app_resolve_venue_id`; an unknown reservation is `null` and the
 * handler 404s. A lookup that throws propagates, and the caller fails closed.
 */
const venueOf = async (request: FastifyRequest): Promise<string | null> => {
  const params = request.params as { id?: unknown } | null;
  if (request.routeOptions.url === RESERVATION_ROUTE && typeof params?.id === "string") {
    return (await resolveVenueId("reservation", params.id)) ?? null;
  }
  if (request.routeOptions.url?.startsWith(VENUE_ROUTE_PREFIX) && typeof params?.id === "string") {
    return params.id;
  }
  const sources = [request.params, request.body, request.query] as const;
  for (const source of sources) {
    const venueId = (source as { venueId?: unknown } | null | undefined)?.venueId;
    if (typeof venueId === "string") return venueId;
  }
  return null;
};

/**
 * Fail-closed audit of every write made with a write-scoped personal access
 * token (#9780). Register after `registerPatReadOnlyGuard`: its preHandler
 * refuses anything off the allowlist first, so only an allowed write reaches
 * this one. The row is inserted before the handler runs; if that fails the
 * answer is 503 and nothing runs. A reused `Mbe-Confirm-Nonce` answers 409.
 * The input can hold guest notes, so it is stored and never logged.
 */
export function registerPatWriteAudit(fastify: FastifyInstance): void {
  fastify.addHook("preHandler", async (request, reply) => {
    const raw = request.user?.raw;
    if (raw?.mbePat !== true || raw.mbePatWrite !== true) return;
    if (request.method === "GET" || request.method === "HEAD") return;

    try {
      const id = await fastify.services.accessTokenAuditService.record({
        tokenId: String(raw.mbePatId),
        userSub: request.user!.id,
        method: request.method,
        route: request.routeOptions.url ?? "",
        venueId: await venueOf(request),
        input: {
          params: request.params,
          query: request.query,
          body: request.body ?? null,
        } as Prisma.InputJsonValue,
        tool: headerValue(request, TOOL_HEADER),
        confirmNonce: headerValue(request, NONCE_HEADER),
      });
      auditIds.set(request, id);
    } catch (error) {
      if (error instanceof DuplicateConfirmNonceError) {
        return reply
          .code(409)
          .send(
            createProblemDetails(
              409,
              "Conflict",
              "This confirmation was already used.",
              "urn:mbe:problem:confirm-replayed"
            )
          );
      }
      request.log.error({ err: error }, "personal access token write audit failed");
      return reply
        .code(503)
        .send(
          createProblemDetails(
            503,
            "Service Unavailable",
            "The change could not be recorded, so it was not made.",
            "urn:mbe:problem:audit-unavailable"
          )
        );
    }
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const id = auditIds.get(request);
    if (!id) return;
    try {
      await fastify.services.accessTokenAuditService.recordStatus(id, reply.statusCode);
    } catch (error) {
      request.log.error({ err: error }, "personal access token write audit status failed");
    }
  });
}
