import { createHash, timingSafeEqual } from "crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { createProblemDetails, publicDepositBodyJsonSchema } from "@mbe/types";
import { venueService } from "../services/venue.js";
import { calculateDepositAmount } from "../services/deposit.js";
import { StripeOperationError } from "../services/stripe.js";
import { reservationService } from "../services/reservation.js";
import { publicVenueScoped } from "./public-venue-scope.js";

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

const SESSION_ID_HEADER = "x-session-id";

/**
 * Constant-time equality for opaque session ids. Hashing both sides first
 * gives `timingSafeEqual` equal-length inputs, so neither the content nor the
 * length of the stored id leaks through response timing.
 */
function sessionIdsMatch(presented: string, stored: string): boolean {
  const sha256 = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(sha256(presented), sha256(stored));
}

/**
 * Proof of ownership (#6304): the caller must present the booking-widget
 * session (`x-session-id`, minted at hold creation) that confirmed this
 * reservation. A bare reservationId is a guessable cuid and proves nothing.
 * A reservation with no originating session (created outside the widget)
 * can never be proven, so it is always rejected here.
 */
function ownsReservation(request: FastifyRequest, originSessionId: string | null): boolean {
  const presented = request.headers[SESSION_ID_HEADER];
  if (typeof presented !== "string" || presented.length === 0) return false;
  if (originSessionId === null) return false;
  return sessionIdsMatch(presented, originSessionId);
}

/**
 * Public (unauthenticated) endpoint for creating a Stripe PaymentIntent + Deposit
 * during the booking widget flow.
 *
 * The booking widget is public — guests are not authenticated. This endpoint:
 * 1. Verifies the reservation belongs to the given venue slug, and that the
 *    caller's `x-session-id` is the session that confirmed it (403 otherwise).
 * 2. Calculates the deposit amount from venue config.
 * 3. Creates a Stripe PaymentIntent (manual capture).
 * 4. Creates a Deposit record in `pending` state.
 * 5. Returns the client_secret for Stripe.js to confirm on the frontend.
 */
export const publicDepositRoutes: FastifyPluginAsync = async (fastify) => {
  const { depositService } = fastify.services;

  fastify.post<{
    Params: { slug: string };
    Body: CreatePublicPaymentIntentBody;
    Reply: { data: PublicPaymentIntentResponse } | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/deposits/payment-intent",
    {
      // Dedicated per-route cap: each call creates a real Stripe Customer +
      // PaymentIntent (cost, quota pressure, and an enumeration oracle
      // against reservationId/slug pairs). Default `onRequest` hook stage —
      // no auth/request-context is needed to key on, so this only swaps the
      // service-wide 100/min limiter for a stricter one at the SAME stage,
      // never disabling it (see gotchas.md "Fastify / rate limiting" for the
      // preHandler footgun this deliberately avoids).
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
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
    publicVenueScoped({ slug: (request) => request.params.slug }, async (request, reply) => {
      const { slug } = request.params;
      const { reservationId, guestEmail, guestName } = request.body;

      // ADR-026 §3.3 item 3: resolve via the SECURITY DEFINER function, then
      // run the whole flow (policy lookup, reservation ownership check,
      // deposit create) inside that venue's RLS context.

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

      // Ownership proof, checked before any Stripe call (#6304). 403, not
      // 404: the 404 above is the enumeration path, this is the auth path.
      const originSessionId = await reservationService.getOriginSessionId(reservationId);
      if (!ownsReservation(request, originSessionId)) {
        return reply
          .status(403)
          .send(
            createProblemDetails(
              403,
              "Forbidden",
              `Pass the booking session ID via the ${SESSION_ID_HEADER} header to pay a deposit for this reservation.`
            )
          );
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
          const customer = await fastify.payments.createCustomer({
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
        paymentIntent = await fastify.payments.createPaymentIntent({
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
    })
  );
};
