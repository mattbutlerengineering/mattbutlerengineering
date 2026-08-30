import type { FastifyPluginAsync } from "fastify";
import type Stripe from "stripe";
import { createProblemDetails } from "@mbe/types";
import { stripeService } from "../services/stripe.js";
import { depositService } from "../services/deposit.js";
import { createRawBodyCaptureHook } from "../middleware/raw-body-capture.js";
import { WebhookEventRouter } from "./webhook-event-router.js";

/**
 * Stripe webhook endpoint.
 * Handles: payment_intent.succeeded, payment_intent.canceled, charge.refunded
 *
 * Signature verification requires the exact bytes Stripe sent. The plugin's
 * preParsing hook (see createRawBodyCaptureHook) captures them into
 * request.rawBody before Fastify's JSON body parser runs, scoped to this
 * route via fastify.register encapsulation.
 */

async function onPaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const paymentIntentId = paymentIntent.id;

  const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

  if (!deposit) {
    return;
  }

  // Only transition from pending to held if not already transitioned. hold()
  // itself is a CAS (updateMany guarded on status = "pending"), so a
  // concurrent retry of this same webhook that also passes this check safely
  // no-ops (returns false) instead of double-transitioning — nothing further
  // to do here either way, so the boolean is intentionally unused.
  if (deposit.status === "pending") {
    await depositService.hold(deposit.id, paymentIntentId);
  }
}

async function onPaymentIntentCanceled(event: Stripe.Event): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const paymentIntentId = paymentIntent.id;

  const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

  if (!deposit) return;

  // If pending, can't directly refund (no transition pending → refunded)
  // If held, we can refund
  if (deposit.status === "held") {
    await depositService.refund(deposit.id);
  }
}

async function onChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  // charge.payment_intent is the PaymentIntent ID (string) or a full PaymentIntent object
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

  if (!paymentIntentId) return;

  const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

  if (!deposit) return;

  // Only transition if currently held
  if (deposit.status === "held") {
    await depositService.refund(deposit.id);
  }
}

const webhookRouter = new WebhookEventRouter()
  .register("payment_intent.succeeded", onPaymentIntentSucceeded)
  .register("payment_intent.canceled", onPaymentIntentCanceled)
  .register("charge.refunded", onChargeRefunded);

export const stripeWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Scoped to this plugin's routes only (fastify.register encapsulation) — captures
  // the untouched request bytes into request.rawBody before the JSON body parser
  // consumes the stream, so signature verification below runs against the exact
  // bytes Stripe sent, not a re-serialization of the parsed body.
  fastify.addHook("preParsing", createRawBodyCaptureHook());

  fastify.post("/api/v1/stripe/webhook", async (request, reply) => {
    // Fail closed if the signing secret is not configured. An empty secret
    // makes Stripe's HMAC verification use an empty (publicly known) key,
    // which would accept forged events — so never reach verification without
    // a real secret. Deposits are disabled in this state anyway.
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    if (!webhookSecret) {
      return reply
        .code(503)
        .send(
          createProblemDetails(503, "Service Unavailable", "Stripe webhooks are not configured")
        );
    }

    const signature = request.headers["stripe-signature"];

    if (!signature || typeof signature !== "string") {
      return reply
        .code(400)
        .send(createProblemDetails(400, "Bad Request", "Missing stripe-signature header"));
    }

    // Raw bytes are captured by the preParsing hook registered above, before
    // Fastify's JSON parser touches the stream. Fail closed rather than fall
    // back to a JSON.stringify(request.body) reconstruction — that would
    // verify the signature against re-serialized JSON, not what Stripe signed.
    const rawBody = request.rawBody;
    if (!rawBody) {
      fastify.log.error("Stripe webhook: raw body was not captured — refusing to verify");
      return reply
        .code(500)
        .send(createProblemDetails(500, "Internal Server Error", "Unable to verify webhook"));
    }

    let event: Stripe.Event;
    try {
      event = stripeService.constructWebhookEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid webhook signature";
      return reply.code(400).send(createProblemDetails(400, "Bad Request", message));
    }

    try {
      await webhookRouter.dispatch(event);
    } catch (err) {
      // Handler threw — likely a transient failure (DB blip, network error).
      // Return 5xx so Stripe retries. Idempotency guards in the deposit service
      // (CAS updateMany + Stripe idempotency keys) make retries safe.
      fastify.log.error({ err, eventType: event.type }, "Error handling Stripe webhook event");
      return reply
        .code(500)
        .send(createProblemDetails(500, "Internal Server Error", "Webhook handler failed"));
    }

    return reply.code(200).send({ received: true });
  });
};
