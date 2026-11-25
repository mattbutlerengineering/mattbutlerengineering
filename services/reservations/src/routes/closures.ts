import type { FastifyPluginAsync } from "fastify";
import {
  availabilityConfigEndpoints,
  createProblemDetails,
  DEFAULT_GUEST_NOTICE_LOCALE,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import { createHostBrandResolver } from "../config/host-brand.js";
import { previewClosureNotice } from "../notifications/closure-preview.js";
import { ClosureRefundEnqueueError } from "../services/closure-refund.js";
import { CLOSURE_REFUSAL_COPY, sendAvailabilityRefusal } from "./availability-refusal.js";
import { CLOSURE_FORBIDDEN, closureCaller } from "./closure-caller.js";
import { runClosurePostCommit, runReopenNotice } from "./closure-post-commit.js";
import { generateManageToken } from "./public-reservations.js";
import { venueScoped } from "./venue-scope.js";

/**
 * Closure command routes (docs/features/venue-availability/architecture.md
 * § Reservations HTTP). Humble adapters: the store decides, these translate
 * its outcomes. Any venue member may call them; Manager vs Host is decided by
 * the store (`mayCloseFor`), so a Host outside the emergency limits gets 403.
 */

const VENUE_FROM_ID = { venue: { from: "params", field: "id" } } as const;
const VENUE_NOT_FOUND = "Venue not found";

/**
 * A signed link's length depends on the booking id and the guest's email, and the notice's SMS
 * picks its body by length, so the preview signs for a booking of a typical size: a cuid and a
 * 35-character address (about 187 characters, as a real token is).
 */
const SAMPLE_BOOKING_ID = "c".repeat(25);
const SAMPLE_GUEST_EMAIL = `${"g".repeat(22)}@example.com`;

export const closureRoutes: FastifyPluginAsync = async (fastify) => {
  const { closureCommandService, closureNoticeService } = fastify.services;
  const hostBrandFor = createHostBrandResolver(process.env);

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
      if (outcome.kind !== "saved")
        return sendAvailabilityRefusal(reply, outcome, CLOSURE_REFUSAL_COPY);
      // After the commit; failures are logged, never returned.
      if (outcome.postCommit) await runClosurePostCommit(fastify, request.log, outcome.postCommit);
      return { data: outcome.result };
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.closureNoticePreview, {
    docs: {
      summary: "Preview the notice a guest would be sent for a Step 2 outcome",
      operationId: "previewClosureNotice",
      description:
        "Read-only. Renders one booking's email and SMS with the same builders the CLOSURE_NOTICE job sends with, in the venue's name and time zone. The email body is returned as the plain text a guest reads. The guest's own manage link and any open rebooking times are only made when a notice is really sent, so the preview shows neither. The body names the guest it is for; nothing here logs it. Any venue member (a Host's emergency close shows it too).",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId }) => {
      const venue = await fastify.services.venueService.getById(venueId);
      if (!venue) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
      }
      const { action, closureDate, startTime, partySize, guestName, message, refund, locale } =
        request.body;
      const brand = hostBrandFor(request.body.originHost ?? null);
      const preview = previewClosureNotice({
        action,
        closureDate,
        startTime,
        partySize,
        guestName,
        locale: locale ?? DEFAULT_GUEST_NOTICE_LOCALE,
        message,
        refund,
        venueName: venue.name,
        timezone: venue.ianaTimezone,
        manageBaseUrl: brand.manageBaseUrl,
        manageToken: generateManageToken(SAMPLE_BOOKING_ID, SAMPLE_GUEST_EMAIL),
        from: brand.fromAddress,
      });
      return { data: preview };
    }),
  });

  registerEndpoint(fastify, availabilityConfigEndpoints.createClosures, {
    docs: {
      summary: "Save several closures in one transaction",
      operationId: "createClosures",
      description:
        "Each item is a `POST …/closures` body; the items commit in order inside one transaction, so a refusal (a missing decision, a move with no open time, a stale version) saves none of them and cancels no booking. Every item keeps its own rule, outcomes, audit row, refund job and notices. Requires an `Idempotency-Key` header; a replay returns the stored results. Manager only.",
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
      const outcome = await closureCommandService.createMany({
        venueId,
        caller,
        body: request.body,
        idempotencyKey: key,
        now: new Date(),
      });
      if (outcome.kind !== "saved")
        return sendAvailabilityRefusal(reply, outcome, CLOSURE_REFUSAL_COPY);
      // After the commit; failures are logged, never returned.
      for (const plan of outcome.postCommit) await runClosurePostCommit(fastify, request.log, plan);
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
        "Removes a closure (or special hours) saved through `POST …/closures` so its slots return. Guests it cancelled stay cancelled. Takes no `expectedVersion`: a save to anything else never stops a reopen. Optional `seen` is the rule and its skips and one-date edits as the caller read them (they are deleted together): if they differ now (a teammate extended or edited the rule), nothing is changed and the answer is 409 `version-conflict` naming the latest change, so the caller refreshes. A caller that sends no `seen` (an older client) reopens the rule as it is now, whatever changed since it read it; an already-removed rule answers 404. Optional `date` (Manager, needs `seen`) reopens only that date of a bounded, non-repeating range: the range is removed and its other dates are saved as new rules, each cancelled guest's outcome follows their date to the rule that still closes it, and the reopen notice reaches only guests on the reopened date. Undo of a reopen that told no guest puts the range and its outcomes back exactly. Manager, or a Host for the emergency close they made themselves on the current service day when the venue grants it.",
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
        seen: request.body.seen,
        date: request.body.date,
        now: new Date(),
      });
      if (outcome.kind === "reopened") {
        if (outcome.notice) await runReopenNotice(fastify, request.log, outcome.notice);
        return { data: outcome.result };
      }
      return sendAvailabilityRefusal(reply, outcome, CLOSURE_REFUSAL_COPY);
    }),
  });
};
