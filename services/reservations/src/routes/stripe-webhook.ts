import type { FastifyPluginAsync } from "fastify";
import type Stripe from "stripe";
import { createProblemDetails } from "@mbe/types";
import { stripeService } from "../services/stripe.js";
import { depositService } from "../services/deposit.js";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

/**
 * Stripe webhook endpoint.
 * Handles: payment_intent.succeeded, payment_intent.canceled, charge.refunded
 *
 * Note: raw body access is required for signature verification.
 * This route must be registered BEFORE any JSON body parsers that modify the raw body.
 */
export const stripeWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/stripe/webhook",
    {
      config: {
        // Disable body parsing — we need the raw body for Stripe signature verification
        rawBody: true,
      },
    },
    async (request, reply) => {
      const signature = request.headers["stripe-signature"];

      if (!signature || typeof signature !== "string") {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "Missing stripe-signature header"));
      }

      // Get raw body buffer
      const rawBody =
        (request as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(request.body));

      let event: Stripe.Event;
      try {
        event = stripeService.constructWebhookEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid webhook signature";
        return reply.code(400).send(createProblemDetails(400, "Bad Request", message));
      }

      try {
        await handleStripeEvent(event);
      } catch (err) {
        // Log but don't fail — return 200 to prevent Stripe retrying
        fastify.log.error({ err, eventType: event.type }, "Error handling Stripe webhook event");
      }

      return reply.code(200).send({ received: true });
    }
  );
};

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const paymentIntentId = paymentIntent.id;

      // Find the deposit associated with this PaymentIntent
      const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

      if (!deposit) {
        // No deposit linked — nothing to do
        return;
      }

      // Only transition from pending to held if not already transitioned
      if (deposit.status === "pending") {
        await depositService.hold(deposit.id, paymentIntentId);
      }
      break;
    }

    case "payment_intent.canceled": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const paymentIntentId = paymentIntent.id;

      const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

      if (!deposit) return;

      // If pending, can't directly refund (no transition pending → refunded)
      // If held, we can refund
      if (deposit.status === "held") {
        await depositService.refund(deposit.id);
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      // charge.payment_intent is the PaymentIntent ID (string) or a full PaymentIntent object
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;

      if (!paymentIntentId) return;

      const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

      if (!deposit) return;

      // Only transition if currently held
      if (deposit.status === "held") {
        await depositService.refund(deposit.id);
      }
      break;
    }

    default:
      // Unknown event type — ignore gracefully
      break;
  }
}
