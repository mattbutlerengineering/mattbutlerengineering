import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  availabilityConfigEndpoints,
  createProblemDetails,
  type AvailabilityConfigProblem,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import { SCOPE_CONFLICT_HORIZON_DAYS } from "../services/availability-config-plan.js";
import type { CreateClosureOutcome } from "../services/closure-command.js";
import { ClosureRefundEnqueueError } from "../services/closure-refund.js";
import { CLOSURE_FORBIDDEN, closureCaller } from "./closure-caller.js";
import { enqueueClosureJobs, enqueueNotices } from "./closure-post-commit.js";
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

export function sendRefusal(reply: FastifyReply, outcome: Refusal) {
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

  registerEndpoint(fastify, availabilityConfigEndpoints.createClosure, {
    docs: {
      summary: "Save a closure with a decision for every affected group",
      operationId: "createClosure",
      description:
        "Writes the date rule (kind `closure` or `special_hours`), one outcome per affected reservation, the cancels and moves with their reservation events, and the audit row in one transaction, so no active booking overlaps a saved closure unless its outcome is keep. A cancelled booking's deposit stays held with the outcome's refund pending for the refund job; no Stripe call is made here. After the commit, one CLOSURE_NOTICE job is enqueued per notified outcome; an enqueue failure is logged, not returned. Requires an `Idempotency-Key` header; a replay returns the stored result and changes nothing. Manager, or a Host for the emergency whole-venue close of the current service day when the venue grants it.",
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
      // After the commit; failures are logged, never returned.
      await enqueueClosureJobs(fastify, request.log, {
        venueId,
        ruleId: outcome.result.ruleId,
        cancelled: outcome.result.outcomes.cancel,
      });
      return { data: outcome.result };
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.listClosures, {
    docs: {
      summary: "Outcome counts for every closure",
      operationId: "listClosures",
      description:
        "Sent / Rebooked / Unreachable and refund counts per date rule that produced closure outcomes, for the Special dates tab. Includes reopened closures and ended Tonight close-early rules. Any venue member.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (_request, _reply, { venueId }) => ({
      data: await closureNoticeService.summaries(venueId),
    })),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.closureCallList, {
    docs: {
      summary: "Call list for one closure",
      operationId: "closureCallList",
      description:
        "Guests the closure told but without a confirmed delivery or a rebooking: name, party, time and phone. Any venue member (a Host who made the emergency close needs it).",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, _reply, { venueId }) => {
      const entries = await closureNoticeService.callList(venueId, request.params.ruleId);
      return { data: entries.map((e) => ({ ...e, startTime: e.startTime.toISOString() })) };
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.retryClosureRefunds, {
    docs: {
      summary: "Retry a closure's refunds",
      operationId: "retryClosureRefunds",
      description:
        "Re-enqueues the refund job for outcomes still `pending` or `failed` through `closureRefunds.retry`; settled outcomes are never touched and the Stripe idempotency keys are unchanged, so a guest is never refunded twice. Covers Tonight close-early rules too (keyed by date rule id, even after the rule ended). Manager only.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId, isAdmin }) => {
      const caller = await closureCaller(request, venueId, isAdmin);
      if (!caller.isManager) {
        return reply.code(403).send(createProblemDetails(403, "Forbidden", CLOSURE_FORBIDDEN));
      }
      try {
        const enqueued = await fastify.closureRefunds.retry(venueId, request.params.ruleId);
        return { data: { enqueued } };
      } catch (err) {
        request.log.error({ err, venueId, ruleId: request.params.ruleId }, "refund retry failed");
        const queued = err instanceof ClosureRefundEnqueueError ? err.enqueued : 0;
        return reply
          .code(503)
          .send(
            createProblemDetails(
              503,
              "Service Unavailable",
              `Couldn't queue every refund (${queued} queued before the failure). Retry to finish the rest.`
            )
          );
      }
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
