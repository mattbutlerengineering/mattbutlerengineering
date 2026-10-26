import type { FastifyPluginAsync } from "fastify";
import { availabilityConfigEndpoints, createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import { closureCaller } from "./closure-caller.js";
import { enqueueClosureJobs } from "./closure-post-commit.js";
import { sendRefusal } from "./closures.js";
import { venueScoped } from "./venue-scope.js";

/**
 * Tonight routes (docs/features/venue-availability/architecture.md
 * § Reservations HTTP). Humble adapters over `tonightCommandService`. Any
 * venue member may call them: Tonight changes are the Host's job, and the one
 * with consequences for bookings, a close-early, is decided by the closure
 * command it runs through.
 */

const VENUE_FROM_ID = { venue: { from: "params", field: "id" } } as const;

export const tonightRoutes: FastifyPluginAsync = async (fastify) => {
  const { tonightCommandService } = fastify.services;

  registerEndpoint(fastify, availabilityConfigEndpoints.setTonight, {
    docs: {
      summary: "Apply a Tonight change for the current service day",
      operationId: "setTonight",
      description:
        "Pause online booking, close early, stop a time window, block tables or lower pacing for the venue's current service day. The server writes a `tonight` date rule that ends at the service-day boundary (`expiresAt`); schedules are never touched. A close-early with bookings after the new close runs the closure command: answer `decision-required` with `decisions`. The client-chosen `ruleId` makes a retry safe. Host or Manager.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId, isAdmin }) => {
      const caller = await closureCaller(request, venueId, isAdmin);
      const outcome = await tonightCommandService.set({
        venueId,
        caller,
        body: request.body,
        now: new Date(),
      });
      if (outcome.kind === "saved") {
        const { outcomes, ruleId } = outcome.result;
        const affected =
          outcomes.cancel + outcomes.move + outcomes.keep_notify + outcomes.keep_silent;
        // Only a close-early runs the closure command, so only it owes the
        // closure's post-commit refunds and notices.
        if (request.body.change.type === "close_early" && affected > 0) {
          await enqueueClosureJobs(fastify, request.log, {
            venueId,
            ruleId,
            cancelled: outcomes.cancel,
          });
        }
        return { data: outcome.result };
      }
      return sendRefusal(
        reply,
        outcome.kind === "rule_exists" ? { kind: "closure_exists" } : outcome
      );
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.endTonight, {
    docs: {
      summary: "End a Tonight change early",
      operationId: "endTonight",
      description:
        "Removes a Tonight change before its service day ends so its slots and tables return. Bookings a close-early cancelled stay cancelled. Host or Manager.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId, isAdmin }) => {
      const caller = await closureCaller(request, venueId, isAdmin);
      const outcome = await tonightCommandService.end({
        venueId,
        ruleId: request.params.ruleId,
        caller,
        now: new Date(),
      });
      if (outcome.kind === "ended") return { data: outcome.result };
      return reply
        .code(404)
        .send(createProblemDetails(404, "Not Found", "Tonight change not found"));
    }),
  });
};
