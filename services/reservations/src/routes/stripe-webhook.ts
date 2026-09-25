import type { FastifyPluginAsync } from "fastify";
import type Stripe from "stripe";
import { createProblemDetails } from "@mbe/types";
import { stripeService } from "../services/stripe.js";
import { depositService } from "../services/deposit.js";
import { createRawBodyCaptureHook } from "../middleware/raw-body-capture.js";
import { WebhookEventRouter } from "./webhook-event-router.js";

/**
 * Narrow logger shape `onChargeRefunded` needs — satisfied by
 * `FastifyBaseLogger`. Defaults to a no-op so importing this module never
 * requires a logger to exist yet (module load order, unit tests); `app.ts`
 * wires the real fastify/pino logger in at bootstrap via
 * {@link setStripeWebhookLogger}, mirroring `rls-context-mode.ts`'s
 * tripwire-logger pattern.
 */
export interface StripeWebhookLogger {
  info(details: object, msg: string): void;
}

let logger: StripeWebhookLogger = { info: () => undefined };

/** Wires the service's real logger in — called once at app bootstrap. */
export function setStripeWebhookLogger(next: StripeWebhookLogger): void {
  logger = next;
}

/**
 * Stripe webhook endpoint.
 * Handles: payment_intent.succeeded, payment_intent.amount_capturable_updated,
 * payment_intent.canceled, charge.refunded
 *
 * Signature verification requires the exact bytes Stripe sent. The plugin's
 * preParsing hook (see createRawBodyCaptureHook) captures them into
 * request.rawBody before Fastify's JSON body parser runs, scoped to this
 * route via fastify.register encapsulation.
 */

/**
 * Shared pending -> held transition for both webhook events that can signal
 * a successful authorization (see callers below). hold() itself is a CAS
 * (updateMany guarded on status = "pending"), so a concurrent retry of the
 * same event that also passes the `pending` check safely no-ops (returns
 * false) instead of double-transitioning — nothing further to do here either
 * way, so the boolean is intentionally unused.
 */
async function holdIfPending(paymentIntentId: string): Promise<void> {
  const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

  if (!deposit) {
    return;
  }

  if (deposit.status === "pending") {
    await depositService.hold(deposit.id, paymentIntentId);
  }
}

async function onPaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  await holdIfPending(paymentIntent.id);
}

/**
 * Deposits use `capture_method: "manual"` (an authorize-only hold), so a
 * successful authorization fires `amount_capturable_updated`, not
 * `payment_intent.succeeded` — that event only fires later, when the hold is
 * captured. Without this handler a deposit never leaves `pending` (#5719).
 */
async function onPaymentIntentAmountCapturableUpdated(event: Stripe.Event): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  await holdIfPending(paymentIntent.id);
}

async function onPaymentIntentCanceled(event: Stripe.Event): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const paymentIntentId = paymentIntent.id;

  const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

  if (!deposit) return;

  // If pending, can't directly transition (no transition pending → uncollectable/refunded).
  if (deposit.status !== "held") return;

  // Stripe's `cancellation_reason` is the only reliable signal for WHY this
  // intent was canceled — "automatic" means Stripe itself expired the
  // authorization (the ~7-day uncaptured-hold timeout) with nobody deciding
  // anything, which is the same "authorization died before we could act"
  // condition the no-show/forfeit capture-failure path already lands on
  // `uncollectable` for. Every other reason — null/unset (what OUR OWN
  // cancelPaymentIntent call sends, so this covers our own refund() when its
  // Stripe call errors ambiguously after actually canceling), a dashboard
  // cancel (`requested_by_customer`, `duplicate`, `fraudulent`, `abandoned`)
  // — is a deliberate release, not a dead authorization, and must be labeled
  // `refunded` via the same path a staff-initiated refund uses (#5725
  // MEDIUM-3; unifying the `automatic` case onto `uncollectable` is item 3).
  // No Stripe call is made either way — the intent is already canceled.
  if (paymentIntent.cancellation_reason === "automatic") {
    await depositService.expireAuthorization(deposit.id);
  } else {
    await depositService.refund(deposit.id, { skipStripeCancel: true });
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
    logger.info(
      { depositId: deposit.id, paymentIntentId },
      "charge.refunded received for a held deposit; refunding"
    );
    // A dashboard-issued refund can race with (or follow) the intent already
    // being canceled — calling cancelPaymentIntent again would fail against
    // an already-canceled intent and Stripe would retry the webhook forever
    // on the resulting 500, the same class of bug fixed for
    // payment_intent.canceled below (#5719 LOW).
    const intent = await stripeService.retrievePaymentIntent(paymentIntentId);
    await depositService.refund(deposit.id, { skipStripeCancel: intent.status === "canceled" });
    return;
  }

  // A refund issued through the Stripe dashboard AFTER our own capture
  // (applied/forfeited/partial_refunded) never touched the DB before this —
  // the deposit kept reporting stale money-collected state after the guest
  // was actually made whole. Reconcile against Stripe's own cumulative
  // `amount_refunded` on the charge; this never re-transitions `status` or
  // calls Stripe (the refund already happened) — it's an annotation on an
  // already-terminal row (#5725 item 2).
  if (
    deposit.status === "applied" ||
    deposit.status === "forfeited" ||
    deposit.status === "partial_refunded"
  ) {
    logger.info(
      { depositId: deposit.id, paymentIntentId, amountRefunded: charge.amount_refunded },
      "charge.refunded received for a captured deposit; reconciling post-capture refund"
    );
    await depositService.recordPostCaptureRefund(deposit.id, charge.amount_refunded);
  }
}

const webhookRouter = new WebhookEventRouter()
  .register("payment_intent.succeeded", onPaymentIntentSucceeded)
  .register("payment_intent.amount_capturable_updated", onPaymentIntentAmountCapturableUpdated)
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
