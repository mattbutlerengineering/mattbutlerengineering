import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { venueService } from "../services/venue.js";
import { depositService, calculateDepositAmount } from "../services/deposit.js";
import { stripeService } from "../services/stripe.js";
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
        body: {
          type: "object",
          required: ["reservationId"],
          properties: {
            reservationId: { type: "string" },
            guestEmail: { type: "string" },
            guestName: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { reservationId, guestEmail, guestName } = request.body;

      // Use getRawBySlug to get deposit-specific fields not on the mapped Venue type
      const venue = await venueService.getRawBySlug(slug);
      if (!venue) {
        return reply
          .status(404)
          .send(createProblemDetails(404, "Not Found", `No venue found with slug '${slug}'.`));
      }

      if (!venue.depositEnabled) {
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
      if (!reservation || reservation.venueId !== venue.id) {
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
      const depositAmountCents = calculateDepositAmount(venue, reservation.partySize);
      const currency = venue.currencyCode.toLowerCase();

      // Create Stripe PaymentIntent (manual capture = authorize-only hold)
      let stripeCustomerId: string | undefined;
      if (guestEmail || guestName) {
        try {
          const customer = await stripeService.createCustomer({
            email: guestEmail,
            name: guestName,
          });
          stripeCustomerId = customer.id;
        } catch {
          // Non-fatal — continue without customer
        }
      }

      const paymentIntent = await stripeService.createPaymentIntent({
        amountCents: depositAmountCents,
        currency,
        customerId: stripeCustomerId,
        reservationId,
      });

      // Create deposit record in pending state
      const deposit = await depositService.create({
        reservationId,
        amountCents: depositAmountCents,
        currency,
      });

      // Store the PaymentIntent ID on the deposit immediately so the webhook can find it
      await depositService.linkPaymentIntent(deposit.id, paymentIntent.id, stripeCustomerId);

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
