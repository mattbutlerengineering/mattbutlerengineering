import type { FastifyPluginAsync } from "fastify";
import type { DepositStatusView, ProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { venueScoped } from "./venue-scope.js";
import type { Deposit } from "../generated/prisma/index.js";

const DEPOSIT_STATUSES = [
  "pending",
  "held",
  "applied",
  "refunded",
  "partial_refunded",
  "forfeited",
  "uncollectable",
];

const nullableString = { type: ["string", "null"] };
const nullableInteger = { type: ["integer", "null"] };

/** The response allowlist: Fastify's serializer drops every property not named here. */
const depositStatusProperties = {
  status: { type: "string", enum: DEPOSIT_STATUSES },
  amountCents: { type: "integer" },
  currency: { type: "string" },
  heldAt: nullableString,
  appliedAt: nullableString,
  refundedAt: nullableString,
  forfeitedAt: nullableString,
  uncollectableAt: nullableString,
  postCaptureRefundCents: nullableInteger,
  refundAmountCents: nullableInteger,
};

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/** Builds the member-facing view field by field, so a new column never leaks by default. */
function toDepositStatusView(deposit: Deposit): DepositStatusView {
  return {
    status: deposit.status,
    amountCents: deposit.amountCents,
    currency: deposit.currency,
    heldAt: iso(deposit.heldAt),
    appliedAt: iso(deposit.appliedAt),
    refundedAt: iso(deposit.refundedAt),
    forfeitedAt: iso(deposit.forfeitedAt),
    uncollectableAt: iso(deposit.uncollectableAt),
    postCaptureRefundCents: deposit.postCaptureRefundCents,
    refundAmountCents: deposit.refundAmountCents,
  };
}

/**
 * Read-only deposit status for any venue member (#9558). The admin
 * `GET /api/v1/deposits` route stays admin-only because it returns Stripe ids
 * and sits beside the money-moving POSTs; this route answers only the
 * allowlisted fields above.
 */
export const reservationDepositStatusRoutes: FastifyPluginAsync = async (fastify) => {
  const { depositService } = fastify.services;

  fastify.get<{
    Params: { id: string };
    Reply: { data: DepositStatusView | null } | ProblemDetails;
  }>(
    "/:id/deposit-status",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get a reservation's deposit status",
        operationId: "getReservationDepositStatus",
        description:
          "Venue-member read of a reservation's deposit: status, amount, currency and " +
          "lifecycle timestamps only. `data` is null when the reservation has no deposit. " +
          "Never returns Stripe identifiers or payment details.",
        tags: ["Reservations"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            description: "The deposit status, or null when there is no deposit",
            type: "object",
            properties: {
              data: {
                anyOf: [{ type: "object", properties: depositStatusProperties }, { type: "null" }],
              },
            },
          },
          401: { description: "Authentication required", $ref: "Error#" },
          403: { description: "No access to the reservation's venue", $ref: "Error#" },
          404: { description: "Reservation not found", $ref: "Error#" },
        },
      },
    },
    // An unknown id and another venue's id are indistinguishable to a non-admin.
    venueScoped(
      {
        venue: {
          entity: "reservation",
          key: (request) => request.params.id,
          notFound: "Reservation not found",
        },
      },
      async (request) => {
        const deposit = await depositService.getByReservationId(request.params.id);
        return { data: deposit ? toDepositStatusView(deposit) : null };
      }
    )
  );
};
