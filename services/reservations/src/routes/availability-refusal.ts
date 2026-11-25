import type { FastifyReply } from "fastify";
import { createProblemDetails, type AvailabilityConfigProblem } from "@mbe/types";
import { SCOPE_HORIZON_DAYS } from "@mbe/availability";
import type { AvailabilityRefusal } from "../services/availability-refusal.js";
import { CLOSURE_FORBIDDEN } from "./closure-caller.js";

/**
 * The one place an availability refusal becomes an HTTP problem (closures, Tonight, config save
 * and preview, revert). Problem responses identify refusals by the `code` extension (`type` is
 * `about:blank`). Only the `invalid` and `stranded` wording differs by route, so a route names it
 * in `copy`; every other status, `code` and `detail` is shared.
 */

export interface RefusalCopy {
  invalid: string;
  stranded: string;
}

export const CLOSURE_REFUSAL_COPY: RefusalCopy = {
  invalid: "The closure is not valid.",
  stranded: "This change affects existing bookings; a closure gives each one a decision.",
};

export const CONFIG_REFUSAL_COPY: RefusalCopy = {
  invalid: "The availability config is not valid.",
  stranded:
    "This change affects existing bookings; save it through a closure so each one gets a decision.",
};

export const REVERT_REFUSAL_COPY: RefusalCopy = {
  invalid: "The change can no longer be undone against the current availability.",
  stranded: "Undoing this would leave existing bookings without service.",
};

const VENUE_NOT_FOUND = "Venue not found";

type Extension = Omit<AvailabilityConfigProblem, "type" | "title" | "status" | "detail">;

function problem(
  status: 409 | 422 | 503,
  detail: string,
  extension: Extension
): AvailabilityConfigProblem {
  return {
    type: "about:blank",
    title:
      status === 409 ? "Conflict" : status === 422 ? "Unprocessable Entity" : "Service Unavailable",
    status,
    detail,
    ...extension,
  };
}

/** A config preview that ran out of time; a refusal of the preview only, not of a command. */
export type PreviewTimeout = { kind: "timeout" };

export function sendAvailabilityRefusal(
  reply: FastifyReply,
  refusal: AvailabilityRefusal | PreviewTimeout,
  copy: RefusalCopy
) {
  switch (refusal.kind) {
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
            `A closure's dates can span at most ${SCOPE_HORIZON_DAYS} days; use "until I reopen" for an open end.`
          )
        );
    case "version_conflict":
      return reply.code(409).send(
        problem(409, "Availability changed since you loaded it.", {
          code: "version-conflict",
          winningChange: refusal.winningChange,
          currentVersion: refusal.currentVersion,
          ...(refusal.changesSince ? { changesSince: refusal.changesSince } : {}),
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
      return reply
        .code(422)
        .send(problem(422, copy.invalid, { code: "invalid-config", issues: refusal.issues }));
    case "stranded":
      return reply.code(409).send(
        problem(409, copy.stranded, {
          code: "stranded-bookings",
          reservations: refusal.reservations,
        })
      );
    case "decision_required":
      return reply
        .code(422)
        .send(
          problem(
            422,
            "Every affected group needs a choice (and keeping silently needs a confirmation).",
            { code: "decision-required", groupKeys: refusal.groupKeys }
          )
        );
    case "invalid_decision":
      return reply.code(422).send(
        problem(422, "A decision names an unknown or repeated group, or moves a closed day.", {
          code: "invalid-decision",
          groupKeys: refusal.groupKeys,
        })
      );
    case "move_unavailable":
      return reply.code(422).send(
        problem(422, "Some bookings have no open time to move to; choose another outcome.", {
          code: "move-unavailable",
          reservationIds: refusal.reservationIds,
        })
      );
    case "timeout":
      return reply
        .code(503)
        .send(problem(503, "The preview took too long; try again.", { code: "preview-timeout" }));
  }
}
