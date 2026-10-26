import type { FastifyBaseLogger, FastifyPluginAsync, FastifyReply } from "fastify";
import {
  availabilityConfigEndpoints,
  createProblemDetails,
  type AvailabilityConfigProblem,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import { SCOPE_CONFLICT_HORIZON_DAYS } from "../services/availability-config-plan.js";
import type { CreateClosureOutcome } from "../services/closure-command.js";
import { CLOSURE_FORBIDDEN, closureCaller } from "./closure-caller.js";
import { venueScoped } from "./venue-scope.js";

/**
 * Closure command routes (docs/features/venue-availability/architecture.md
 * § Reservations HTTP). Humble adapters: the store decides, these translate
 * its outcomes. Any venue member may call them; Manager vs Host is decided by
 * the store (`mayCloseFor`), so a Host outside the emergency limits gets 403.
 */

const VENUE_FROM_ID = { venue: { from: "params", field: "id" } } as const;
const VENUE_NOT_FOUND = "Venue not found";

type Refusal = Exclude<CreateClosureOutcome, { kind: "saved" }>;

function problem(
  status: 409 | 422,
  detail: string,
  extension: Omit<AvailabilityConfigProblem, "type" | "title" | "status" | "detail">
): AvailabilityConfigProblem {
  return {
    type: "about:blank",
    title: status === 409 ? "Conflict" : "Unprocessable Entity",
    status,
    detail,
    ...extension,
  };
}

function sendRefusal(reply: FastifyReply, outcome: Refusal) {
  switch (outcome.kind) {
    case "not_found":
      return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
    case "forbidden":
      return reply.code(403).send(createProblemDetails(403, "Forbidden", CLOSURE_FORBIDDEN));
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
    case "version_conflict":
      return reply.code(409).send(
        problem(409, "Availability changed since you loaded it.", {
          code: "version-conflict",
          winningChange: outcome.winningChange,
        })
      );
    case "closure_exists":
      return reply.code(409).send(
        problem(409, "This closure was already saved; reopen it or use a new rule id.", {
          code: "closure-exists",
        })
      );
    case "key_reused":
      return reply.code(409).send(
        problem(409, "This Idempotency-Key was already used for a different closure.", {
          code: "idempotency-key-reused",
        })
      );
    case "invalid":
      return reply.code(422).send(
        problem(422, "The closure is not valid.", {
          code: "invalid-config",
          issues: outcome.issues,
        })
      );
    case "decision_required":
      return reply.code(422).send(
        problem(
          422,
          "Every affected group needs a choice (and keeping silently needs a confirmation).",
          {
            code: "decision-required",
            groupKeys: outcome.groupKeys,
          }
        )
      );
    case "invalid_decision":
      return reply.code(422).send(
        problem(422, "A decision names an unknown or repeated group, or moves a closed day.", {
          code: "invalid-decision",
          groupKeys: outcome.groupKeys,
        })
      );
    case "move_unavailable":
      return reply.code(422).send(
        problem(422, "Some bookings have no open time to move to; choose another outcome.", {
          code: "move-unavailable",
          reservationIds: outcome.reservationIds,
        })
      );
  }
}

export const closureRoutes: FastifyPluginAsync = async (fastify) => {
  const { closureCommandService, closureNoticeService } = fastify.services;

  /**
   * The closure is already committed, so a queue outage must not turn the
   * answer into an error: log it. Guests with no confirmed delivery are on
   * the call list, and a replay of the same Idempotency-Key enqueues again.
   */
  async function enqueueNotices(
    enqueue: typeof closureNoticeService.enqueueForClosure,
    input: { venueId: string; ruleId: string },
    log: FastifyBaseLogger
  ): Promise<void> {
    try {
      await enqueue({ ...input, now: new Date() });
    } catch (error) {
      log.error({ err: error, ...input }, "closure notices were not enqueued");
    }
  }

  registerEndpoint(fastify, availabilityConfigEndpoints.createClosure, {
    docs: {
      summary: "Save a closure with a decision for every affected group",
      operationId: "createClosure",
      description:
        "Writes the date rule (kind `closure` or `special_hours`), one outcome per affected reservation, the cancels and moves with their reservation events, and the audit row in one transaction, so no active booking overlaps a saved closure unless its outcome is keep. A cancelled booking's deposit stays held with the outcome's refund pending for the refund job; no Stripe call is made and no guest is notified here. Requires an `Idempotency-Key` header; a replay returns the stored result and changes nothing. Manager, or a Host for the emergency whole-venue close of the current service day when the venue grants it.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId, isAdmin }) => {
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || key.trim() === "") {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "Idempotency-Key header is required"));
      }
      const caller = await closureCaller(request, venueId, isAdmin);
      const outcome = await closureCommandService.create({
        venueId,
        caller,
        body: request.body,
        idempotencyKey: key,
        now: new Date(),
      });
      if (outcome.kind !== "saved") return sendRefusal(reply, outcome);
      // After the commit. A failed enqueue must not undo or hide the save: the
      // outcomes stay `refund: pending` and `closureRefunds.retry` picks them up.
      if (outcome.result.outcomes.cancel > 0) {
        try {
          await fastify.closureRefunds.enqueue(venueId, outcome.result.ruleId);
        } catch (err) {
          request.log.error(
            { err, venueId, ruleId: outcome.result.ruleId },
            "Failed to enqueue closure refund jobs"
          );
        }
      }
      // Independent of the refund enqueue above: each logs its own failure.
      await enqueueNotices(
        closureNoticeService.enqueueForClosure,
        { venueId, ruleId: outcome.result.ruleId },
        request.log
      );
      return { data: outcome.result };
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.reopenClosure, {
    docs: {
      summary: "Reopen a closure",
      operationId: "reopenClosure",
      description:
        "Removes a closure (or special hours) saved through `POST …/closures` so its slots return. Guests it cancelled stay cancelled. Manager, or a Host for the emergency close they made themselves on the current service day when the venue grants it.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId, isAdmin }) => {
      const caller = await closureCaller(request, venueId, isAdmin);
      const outcome = await closureCommandService.reopen({
        venueId,
        ruleId: request.params.ruleId,
        caller,
        tellCancelledGuests: request.body.tellCancelledGuests,
        now: new Date(),
      });
      if (outcome.kind === "reopened") {
        if (request.body.tellCancelledGuests) {
          await enqueueNotices(
            closureNoticeService.enqueueForReopen,
            { venueId, ruleId: request.params.ruleId },
            request.log
          );
        }
        return { data: outcome.result };
      }
      return sendRefusal(reply, outcome);
    }),
  });
};
