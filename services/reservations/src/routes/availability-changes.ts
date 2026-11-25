import type { FastifyPluginAsync } from "fastify";
import {
  availabilityConfigEndpoints,
  createProblemDetails,
  type AvailabilityConfigProblem,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import type { RevertRefusalReason } from "../services/availability-changes.js";
import { actorNameOf } from "../services/actor-name.js";
import { REVERT_REFUSAL_COPY, sendAvailabilityRefusal } from "./availability-refusal.js";
import { venueScoped } from "./venue-scope.js";

/**
 * Availability history and undo (docs/features/venue-availability/
 * architecture.md § Reservations HTTP). Humble adapters: the store decides.
 * History reads need venue membership; a revert needs Manager.
 */

const VENUE_FROM_ID = { venue: { from: "params", field: "id" } } as const;

const REFUSALS: Record<
  RevertRefusalReason,
  { code: AvailabilityConfigProblem["code"]; detail: string }
> = {
  guests_notified: {
    code: "guests-notified",
    detail: "This change told guests, so it can't be undone.",
  },
  already_reverted: { code: "already-reverted", detail: "This change was already undone." },
  superseded: {
    code: "superseded",
    detail: "A newer change exists; only the latest change can be undone.",
  },
  not_revertable: { code: "not-revertable", detail: "This change can't be undone." },
};

export const availabilityChangesRoutes: FastifyPluginAsync = async (fastify) => {
  const { availabilityChangesService } = fastify.services;

  registerEndpoint(fastify, availabilityConfigEndpoints.listChanges, {
    docs: {
      summary: "List a venue's availability history",
      operationId: "listAvailabilityChanges",
      description:
        "Who changed availability, when and what, newest first. `revertible` marks the one change that can still be undone. Filter by the UTC dates a change was made, by person (`actorId`) and by `kind`.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId }) => {
      const page = await availabilityChangesService.list(venueId, request.query);
      if (!page) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
      }
      return { data: page };
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.revertChange, {
    docs: {
      summary: "Undo an availability change",
      operationId: "revertAvailabilityChange",
      description:
        "Applies the change's stored inverse as a new save (compare-and-set on `expectedVersion`, validation and the stranded-bookings check all apply). Refused with 409 `guests-notified` when the change told guests, and `already-reverted`, `superseded` or `not-revertable` otherwise. Requires a Manager (owner or manager) membership, or the admin role.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      { ...VENUE_FROM_ID, access: "manager" },
      async (request, reply, { venueId }) => {
        const outcome = await availabilityChangesService.revert({
          venueId,
          changeId: request.params.changeId,
          actorId: request.user?.id ?? "unknown",
          actorName: actorNameOf(request.user),
          expectedVersion: request.body.expectedVersion,
          now: new Date(),
        });
        switch (outcome.kind) {
          case "saved":
            return { data: { version: outcome.version, changeId: outcome.changeId } };
          case "not_found":
            return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
          case "change_not_found":
            return reply.code(404).send(createProblemDetails(404, "Not Found", "Change not found"));
          case "refused": {
            const { code, detail } = REFUSALS[outcome.reason];
            return reply.code(409).send({
              type: "about:blank",
              title: "Conflict",
              status: 409,
              detail,
              code,
            } satisfies AvailabilityConfigProblem);
          }
          default:
            return sendAvailabilityRefusal(reply, outcome, REVERT_REFUSAL_COPY);
        }
      }
    ),
  });
};
