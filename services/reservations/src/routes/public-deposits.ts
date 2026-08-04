import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails, publicDepositBodyJsonSchema } from "@mbe/types";
import { venueService } from "../services/venue.js";
import { depositService, calculateDepositAmount } from "../services/deposit.js";
import { stripeService, StripeOperationError } from "../services/stripe.js";
import { reservationService } from "../services/reservation.js";

interface CreatePublicPaymentIntentBody {
  reservationId: string;
  guestEmail?: string;
  guestName?: string;
}

interface PublicPaymentIntentResponse {
  clientSecret: string;
  depositId: string;
  amountCents: number;
  currency: string;
}

/**
 * Public (unauthenticated) endpoint for creating a Stripe PaymentIntent + Deposit
 * during the booking widget flow.
 *
 * The booking widget is public — guests are not authenticated. This endpoint:
 * 1. Verifies the reservation belongs to the given venue slug.
 * 2. Calculates the deposit amount from venue config.
 * 3. Creates a Stripe PaymentIntent (manual capture).
 * 4. Creates a Deposit record in `pending` state.
 * 5. Returns the client_secret for Stripe.js to confirm on the frontend.
 */
export const publicDepositRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { slug: string };
    Body: CreatePublicPaymentIntentBody;
    Reply: { data: PublicPaymentIntentResponse } | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/deposits/payment-intent",
    {
      schema: {
        summary: "Create PaymentIntent for deposit (public booking widget)",
        tags: ["Public"],
        params: {
          type: "object",
          required: ["slug"],
          properties: { slug: { type: "string" } },
        },
        body: publicDepositBodyJsonSchema,
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { reservationId, guestEmail, guestName } = request.body;

      // Typed deposit/cancellation policy for this venue — no raw Prisma row.
      const policy = await venueService.getPolicyBySlug(slug);
      if (!policy) {
        return reply
          .status(404)
          .send(createProblemDetails(404, "Not Found", `No venue found with slug '${slug}'.`));
      }

      if (!policy.depositEnabled) {
        return reply
          .status(422)
          .send(
            createProblemDetails(
              422,
              "Unprocessable Entity",
              "Deposits are not enabled for this venue."
            )
          );
      }

      // Verify reservation belongs to this venue
      const reservation = await reservationService.getById(reservationId);
      if (!reservation || reservation.venueId !== policy.id) {
        return reply
          .status(404)
          .send(createProblemDetails(404, "Not Found", "Reservation not found for this venue."));
      }

      // Check no deposit already exists for this reservation
      const existingDeposit = await depositService.getByReservationId(reservationId);
      if (existingDeposit) {
        return reply
          .status(409)
          .send(
            createProblemDetails(409, "Conflict", "A deposit already exists for this reservation.")
          );
      }

      // Calculate deposit amount
      const depositAmountCents = calculateDepositAmount(policy, reservation.partySize);
      const currency = policy.currencyCode.toLowerCase();

      // Create Stripe PaymentIntent (manual capture = authorize-only hold)
      let stripeCustomerId: string | undefined;
      if (guestEmail || guestName) {
        try {
          const customer = await stripeService.createCustomer({
            email: guestEmail,
            name: guestName,
            // Stable key so a lost-response retry reuses the same customer
            // instead of minting a new one — otherwise the second attempt would
            // change the PaymentIntent's customer param and break its own
            // idempotency key, degrading a safe retry into a 502.
            idempotencyKey: `${reservationId}:customer`,
          });
          stripeCustomerId = customer.id;
        } catch (err) {
          // A retriable transient failure must fail-fast, not be swallowed:
          // swallowing mints a customer-less PaymentIntent under the shared
          // `${reservationId}:paymentIntent:${amount}` key, so a later retry that
          // succeeds at customer-create would attach a customer and 502 on the
          // Stripe idempotency param mismatch. Returning 502 here lets the retry
          // re-attempt customer creation deterministically.
          if (err instanceof StripeOperationError && err.isRetriable) {
            request.log.error({ err }, "Stripe customer creation failed (retriable)");
            return reply
              .status(502)
              .send(
                createProblemDetails(
                  502,
                  "Bad Gateway",
                  "Failed to create payment intent with the payment provider."
                )
              );
          }
          // Non-retriable (permanent) customer error — degrade gracefully and
          // take the deposit without a Stripe customer attached.
          request.log.warn(
            { err },
            "Stripe customer creation failed (non-retriable), continuing without customer"
          );
        }
      }

      // Stable idempotency key (reservationId + amount) makes a lost-response
      // retry safe — Stripe returns the original PaymentIntent instead of
      // minting a second hold. Matches the `${id}:${action}` key convention
      // used by the capture/cancel/refund flows.
      let paymentIntent;
      try {
        paymentIntent = await stripeService.createPaymentIntent({
          amountCents: depositAmountCents,
          currency,
          customerId: stripeCustomerId,
          reservationId,
          idempotencyKey: `${reservationId}:paymentIntent:${depositAmountCents}`,
        });
      } catch (err) {
        request.log.error({ err }, "Stripe PaymentIntent creation failed");
        return reply
          .status(502)
          .send(
            createProblemDetails(
              502,
              "Bad Gateway",
              "Failed to create payment intent with the payment provider."
            )
          );
      }

      // Create deposit record in pending state with the PaymentIntent id already
      // set, in one atomic write. This guarantees the succeeded webhook can always
      // find the row — no create → link two-write window that could strand it.
      const deposit = await depositService.create({
        reservationId,
        amountCents: depositAmountCents,
        currency,
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId,
      });

      return reply.status(201).send({
        data: {
          clientSecret: paymentIntent.clientSecret!,
          depositId: deposit.id,
          amountCents: depositAmountCents,
          currency,
        },
      });
    }
  );
};
