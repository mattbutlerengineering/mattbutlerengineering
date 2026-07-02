import type { Reservation } from "@mbe/types";
import { createProblemDetails } from "@mbe/types";
import { reservationService } from "../services/reservation.js";

export type ManagePreambleResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; status: 404; reason: "not_found" }
  | { ok: false; status: 409; reason: "cancelled" | "completed" };

/**
 * Shared preamble for the manage-token routes (cancel, modify): load the
 * reservation by id and guard against terminal states. Both routes need the
 * same load → 404-if-missing → 409-if-CANCELLED → 409-if-COMPLETED sequence;
 * only the reply body text differs, which callers supply themselves by
 * switching on `reason`.
 */
export async function loadReservationForManage(id: string): Promise<ManagePreambleResult> {
  const reservation = await reservationService.getById(id);
  if (!reservation) {
    return { ok: false, status: 404, reason: "not_found" };
  }
  if (reservation.status === "CANCELLED") {
    return { ok: false, status: 409, reason: "cancelled" };
  }
  if (reservation.status === "COMPLETED") {
    return { ok: false, status: 409, reason: "completed" };
  }
  return { ok: true, reservation };
}

/** Which manage-token operation is translating a failed preamble into a problem body. */
export type ManageAction = "cancel" | "modify";

interface ProblemMessage {
  title: string;
  detail: string;
  code: string;
}

const NOT_FOUND_MESSAGE: ProblemMessage = {
  title: "Reservation Not Found",
  detail: "Reservation not found",
  code: "RESERVATION_NOT_FOUND",
};

/**
 * Cancel and modify use the same 409 codes for "cancelled"/"completed" but
 * different guest-facing copy (e.g. cancel treats "already cancelled" as
 * near-idempotent, modify treats it as blocked) — keyed by action.
 */
const ACTION_MESSAGES: Record<ManageAction, Record<"cancelled" | "completed", ProblemMessage>> = {
  cancel: {
    cancelled: {
      title: "Already Cancelled",
      detail: "This reservation is already cancelled",
      code: "RESERVATION_ALREADY_CANCELLED",
    },
    completed: {
      title: "Cannot Cancel",
      detail: "Cannot cancel a completed reservation",
      code: "RESERVATION_ALREADY_COMPLETED",
    },
  },
  modify: {
    cancelled: {
      title: "Cannot Modify",
      detail: "Cannot modify a cancelled reservation",
      code: "RESERVATION_ALREADY_CANCELLED",
    },
    completed: {
      title: "Cannot Modify",
      detail: "Cannot modify a completed reservation",
      code: "RESERVATION_ALREADY_COMPLETED",
    },
  },
};

function problemFromMessage(status: number, message: ProblemMessage) {
  return createProblemDetails(status, message.title, message.detail, "about:blank", undefined, {
    code: message.code,
  });
}

/** Shared 404 for "reservation not found" — used directly by the GET manage route. */
export function reservationNotFoundProblem(): ReturnType<typeof createProblemDetails> {
  return problemFromMessage(404, NOT_FOUND_MESSAGE);
}

/**
 * Translates a failed loadReservationForManage() result into an RFC-7807
 * problem-details body, built on createProblemDetails. `action` selects the
 * cancel- vs modify-specific copy for the cancelled/completed cases; the
 * not_found message is identical for both callers.
 */
export function manageProblemDetails(
  preamble: Extract<ManagePreambleResult, { ok: false }>,
  action: ManageAction
): ReturnType<typeof createProblemDetails> {
  if (preamble.reason === "not_found") {
    return reservationNotFoundProblem();
  }
  return problemFromMessage(preamble.status, ACTION_MESSAGES[action][preamble.reason]);
}
