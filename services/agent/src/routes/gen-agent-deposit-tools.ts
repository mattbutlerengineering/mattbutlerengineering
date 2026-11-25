import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { venueReservation } from "./gen-agent-timeline-tools.js";
import { NO_VENUE, failureLog, readFailure, type ApiClient } from "./gen-tool-support.js";

/**
 * A read-only chat tool for a booking's deposit (#9480). Charging, refunding and
 * waiving stay in the booking's details on the Timeline page: no deposit write is wired here. Only what a
 * host needs is returned; Stripe ids and payment details never leave the service.
 */

const NO_DEPOSIT = {
  hasDeposit: false,
  note: "This reservation has no deposit. Say so plainly.",
} as const;

type Deposit = NonNullable<Awaited<ReturnType<ApiClient["deposits"]["getStatusByReservation"]>>>;

/** The host-facing fields of a deposit; the timestamps that are unset are left out. */
function depositView(deposit: Deposit) {
  const stamps = {
    heldAt: deposit.heldAt,
    appliedAt: deposit.appliedAt,
    refundedAt: deposit.refundedAt,
    forfeitedAt: deposit.forfeitedAt,
    uncollectableAt: deposit.uncollectableAt,
  };
  return {
    hasDeposit: true,
    status: deposit.status,
    amountCents: deposit.amountCents,
    currency: deposit.currency,
    ...Object.fromEntries(Object.entries(stamps).filter(([, value]) => value)),
    ...(deposit.postCaptureRefundCents
      ? { postCaptureRefundCents: deposit.postCaptureRefundCents }
      : {}),
    ...(deposit.refundAmountCents ? { refundAmountCents: deposit.refundAmountCents } : {}),
  };
}

export function createDepositTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  { venueId }: { readonly venueId?: string | undefined }
): ToolSet {
  return {
    get_deposit_status: tool({
      description:
        "Read a booking's deposit: its status (pending, held, applied, refunded, partial_refunded, forfeited, uncollectable), amount in cents with currency, and when it was held, captured, refunded or forfeited. Find the reservationId with lookup_reservation first. Read-only: charging, refunding or waiving a deposit can't be done here and stays in the booking's details on the Timeline page.",
      inputSchema: z.object({
        reservationId: z.string().min(1).describe("The reservation's ID, from a lookup"),
      }),
      execute: async ({ reservationId }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, reservationId }, "get_deposit_status tool called");
        try {
          const found = await venueReservation(api, venueId, reservationId);
          if ("error" in found) return found;
          const deposit = await api.deposits.getStatusByReservation(reservationId);
          return deposit ? depositView(deposit) : NO_DEPOSIT;
        } catch (err) {
          log.error({ ...failureLog(err), venueId, reservationId }, "get_deposit_status failed");
          return readFailure(err, "the deposit");
        }
      },
    }),
  };
}
