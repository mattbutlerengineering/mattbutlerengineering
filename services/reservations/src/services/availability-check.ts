import type { AvailabilityCheckBody, AvailabilityCheckResult } from "@mbe/types";
import { judgeBooking, rejectionDetail, type GateOutcome } from "./assert-bookable.js";
import { prisma } from "./database.js";

function resultOf(outcome: GateOutcome): AvailabilityCheckResult {
  switch (outcome.kind) {
    case "ok":
      return { kind: "ok" };
    case "conflict":
      return {
        kind: "hard",
        reason: "conflict",
        message: rejectionDetail({ code: "outside-availability", reason: "conflict" }),
      };
    case "rejected": {
      const { rejection } = outcome;
      const message = rejectionDetail(rejection);
      return rejection.code === "soft-limit"
        ? { kind: "soft", limits: rejection.limits, message }
        : { kind: "hard", reason: rejection.reason, message };
    }
  }
}

/**
 * What the staff form asks before submit: would the booking gate take this
 * phone booking? Read-only; the same judgement the write paths make, with no
 * override, so a `soft` answer is the cue to ask the caller for a reason.
 * The submit still passes through the gate, so a stale answer cannot book.
 */
export async function checkAvailability(
  venueId: string,
  body: AvailabilityCheckBody,
  now: Date
): Promise<AvailabilityCheckResult> {
  const outcome = await judgeBooking(
    prisma,
    {
      venueId,
      tableId: body.tableId,
      start: new Date(body.start),
      end: body.end === undefined ? undefined : new Date(body.end),
      partySize: body.partySize,
      channel: body.channel,
    },
    now
  );
  return resultOf(outcome);
}
