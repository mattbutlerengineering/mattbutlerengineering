import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  AVAILABILITY_DAYS_MAX_RANGE,
  availabilityConfigEndpoints,
  createProblemDetails,
  type AvailabilityConfigProblem,
} from "@mbe/types";
import { addDays } from "@mbe/availability";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import { SCOPE_CONFLICT_HORIZON_DAYS } from "../services/availability-config-plan.js";
import { CLOSURE_FORBIDDEN, closureCaller } from "./closure-caller.js";
import type { PreviewOutcome, SaveOutcome } from "../services/availability-config.js";
import { venueScoped } from "./venue-scope.js";

/**
 * Availability config API (docs/features/venue-availability/architecture.md
 * § Reservations HTTP). Humble adapters: the store decides, these translate
 * its outcomes to HTTP. Reads need venue membership; the write needs Manager.
 */

const VENUE_NOT_FOUND = "Venue not found";

/** The venue is the path's `:id`, as on the other `/api/v1/venues/:id/*` routes. */
const VENUE_FROM_ID = { venue: { from: "params", field: "id" } } as const;

function configProblem(
  status: 409 | 422 | 503,
  title: string,
  detail: string,
  extension: Omit<AvailabilityConfigProblem, "type" | "title" | "status" | "detail">
): AvailabilityConfigProblem {
  return { type: "about:blank", title, status, detail, ...extension };
}

type ConfigReply = FastifyReply;

function sendRefusal(
  reply: ConfigReply,
  outcome: Exclude<SaveOutcome | PreviewOutcome, { kind: "saved" | "ok" }>
) {
  switch (outcome.kind) {
    case "not_found":
      return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
    case "version_conflict":
      return reply.code(409).send(
        configProblem(409, "Conflict", "Availability changed since you loaded it.", {
          code: "version-conflict",
          winningChange: outcome.winningChange,
        })
      );
    case "invalid":
      return reply.code(422).send(
        configProblem(422, "Unprocessable Entity", "The availability config is not valid.", {
          code: "invalid-config",
          issues: outcome.issues,
        })
      );
    case "timeout":
      return reply.code(503).send(
        configProblem(503, "Service Unavailable", "The preview took too long; try again.", {
          code: "preview-timeout",
        })
      );
    case "stranded":
      return reply
        .code(409)
        .send(
          configProblem(
            409,
            "Conflict",
            "This change affects existing bookings; save it through a closure so each one gets a decision.",
            { code: "stranded-bookings", reservations: outcome.reservations }
          )
        );
  }
}

export const availabilityConfigRoutes: FastifyPluginAsync = async (fastify) => {
  const { availabilityConfigService, closureImpactService, closureCommandService } =
    fastify.services;

  registerEndpoint(fastify, availabilityConfigEndpoints.getConfig, {
    docs: {
      summary: "Get a venue's availability config",
      operationId: "getAvailabilityConfig",
      description:
        "Schedules, services, assignments and date rules, with the version a save must send back. A venue with no rows yet is served its config derived from the legacy operating hours (`source: legacy`).",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (_request, reply, { venueId }) => {
      const state = await availabilityConfigService.get(venueId, new Date());
      if (!state) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
      }
      return { data: state };
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.putConfig, {
    docs: {
      summary: "Save availability config changes",
      operationId: "putAvailabilityConfig",
      description:
        "Applies row upserts and removals with an `expectedVersion` compare-and-set. Requires a Manager (owner or manager) membership, or the admin role.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      { ...VENUE_FROM_ID, access: "manager" },
      async (request, reply, { venueId }) => {
        const outcome = await availabilityConfigService.save({
          venueId,
          actorId: request.user?.id ?? "unknown",
          body: request.body,
          now: new Date(),
        });
        if (outcome.kind !== "saved") return sendRefusal(reply, outcome);
        return { data: { version: outcome.version, changeId: outcome.changeId } };
      }
    ),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.previewAvailability, {
    docs: {
      summary: "Preview an unsaved availability draft",
      operationId: "previewAvailability",
      description:
        "What the draft changes for guests over 30 days from `focusDate`, how the focus date resolves, and the future bookings in `scope` it would strand (a page of 50 from `strandedOffset`). Read-only and safe to retry; answers 503 `preview-timeout` after 5 seconds. Requires a Manager (owner or manager) membership, or the admin role.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      { ...VENUE_FROM_ID, access: "manager" },
      async (request, reply, { venueId }) => {
        const outcome = await availabilityConfigService.preview({
          venueId,
          body: request.body,
          now: new Date(),
        });
        if (outcome.kind !== "ok") return sendRefusal(reply, outcome);
        return { data: outcome.result };
      }
    ),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.listDays, {
    docs: {
      summary: "List resolved availability days",
      operationId: "listAvailabilityDays",
      description: `One calendar summary (label, closure bands, service count) per service date from \`from\` to \`to\` inclusive, at most ${AVAILABILITY_DAYS_MAX_RANGE} days.`,
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId }) => {
      const { from, to } = request.query;
      if (to < from || addDays(from, AVAILABILITY_DAYS_MAX_RANGE - 1) < to) {
        return reply
          .code(400)
          .send(
            createProblemDetails(
              400,
              "Bad Request",
              `\`to\` must be on or after \`from\`, at most ${AVAILABILITY_DAYS_MAX_RANGE} days in all.`
            )
          );
      }
      const days = await availabilityConfigService.listDays(venueId, from, to, new Date());
      if (!days) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
      }
      return { data: days };
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.closureImpact, {
    docs: {
      summary: "Preview which bookings a closure would affect",
      operationId: "getClosureImpact",
      description:
        "Read-only. Future bookings a draft date rule (closure, special hours or Tonight change) would leave without service, grouped by service date and kind, with covers, held deposits and a runs-into-closure flag. Requires a Manager (owner or manager) membership or the admin role; a Host may preview only the emergency whole-venue close for tonight, when the venue grants it.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId, isAdmin }) => {
      const caller = await closureCaller(request, venueId, isAdmin);
      const now = new Date();
      const allowed = await closureCommandService.mayClose(
        venueId,
        caller.isManager,
        request.body.rule,
        now
      );
      if (allowed === null) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
      }
      if (!allowed)
        return reply.code(403).send(createProblemDetails(403, "Forbidden", CLOSURE_FORBIDDEN));
      const outcome = await closureImpactService.impact(venueId, request.body.rule, now);
      switch (outcome.kind) {
        case "not_found":
          return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
        case "too_long":
          return reply
            .code(400)
            .send(
              createProblemDetails(
                400,
                "Bad Request",
                `A closure's dates can span at most ${SCOPE_CONFLICT_HORIZON_DAYS} days; use "until I reopen" for an open end.`
              )
            );
        case "invalid":
          return reply.code(422).send(
            configProblem(422, "Unprocessable Entity", "The closure is not valid.", {
              code: "invalid-config",
              issues: outcome.issues,
            })
          );
        case "ok":
          return { data: outcome.impact };
      }
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.check, {
    docs: {
      summary: "Check a staff booking against availability",
      operationId: "checkAvailability",
      description:
        "The booking gate's verdict on a phone booking (`ok`, `soft` with the limits and a message, or `hard` with the reason and a message), for the staff form. Read-only; the booking write still passes the gate, where a `soft` limit yields to `override.reason` and a `hard` one never does.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, _reply, { venueId }) => ({
      data: await availabilityConfigService.check(venueId, request.body, new Date()),
    })),
  });
};
