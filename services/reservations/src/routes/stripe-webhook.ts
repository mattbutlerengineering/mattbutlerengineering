import type { FastifyPluginAsync } from "fastify";
import type Stripe from "stripe";
import { createProblemDetails } from "@mbe/types";
import { stripeService } from "../services/stripe.js";
import { depositService } from "../services/deposit.js";
import { createRawBodyCaptureHook } from "../middleware/raw-body-capture.js";
import { WebhookEventRouter } from "./webhook-event-router.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";

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
 * Resolves the venue owning the deposit addressed by `paymentIntentId`
 * (ADR-026 §3.3 item 4) through the SECURITY DEFINER `app_resolve_venue_id`
 * — never an unscoped `deposits`/`reservations` read — and runs `work`
 * inside that venue's RLS context.
 *
 * A NULL resolution (no deposit carries this PaymentIntent id, or more than
 * one does — `stripe_payment_intent_id` is indexed, not unique) means deny:
 * `work` is never called, matching every caller's own pre-existing
 * "no deposit found" no-op rather than surfacing as a 500 Stripe would retry
 * forever.
 */
async function withDepositVenueContext(
  paymentIntentId: string,
  work: () => Promise<void>
): Promise<void> {
  const venueId = await resolveVenueId("payment_intent", paymentIntentId);
  if (!venueId) return;
  await runWithVenueContext(venueId, work);
}

/**
 * Shared pending -> held transition for both webhook events that can signal
 * a successful authorization (see callers below). hold() itself is a CAS
 * (updateMany guarded on status = "pending"), so a concurrent retry of the
 * same event that also passes the `pending` check safely no-ops (returns
 * false) instead of double-transitioning — nothing further to do here either
 * way, so the boolean is intentionally unused.
 */
async function holdIfPending(paymentIntentId: string): Promise<void> {
  await withDepositVenueContext(paymentIntentId, async () => {
    const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

    if (!deposit) {
      return;
    }

    if (deposit.status === "pending") {
      await depositService.hold(deposit.id, paymentIntentId);
    }
  });
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

  await withDepositVenueContext(paymentIntentId, async () => {
    const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

    if (!deposit) return;

    // If pending, can't directly transition (no transition pending → uncollectable/refunded).
    if (deposit.status !== "held") return;

    // Stripe's `cancellation_reason` is the only reliable signal for WHY this
    // intent was canceled. A human- or API-chosen reason (null/unset, which is
    // what OUR OWN cancelPaymentIntent call sends, or a dashboard/API cancel:
    // `requested_by_customer`, `duplicate`, `fraudulent`, `abandoned`) is a
    // deliberate release, not a dead authorization, and must be labeled
    // `refunded` via the same path a staff-initiated refund uses (#5725
    // MEDIUM-3). The null case is what OUR OWN refund() sends. When refund()'s
    // own cancel call errors, `_reconcileCancelFailure` keeps `refunded` only if
    // it retrieves `canceled`; otherwise it rolls back to `held` (#5753). If
    // Stripe did cancel after all and this webhook already no-op'd against the
    // interim `refunded` row, the row sits at `held` against a canceled intent
    // until the next action settles it: refund() retrieves `canceled` and keeps
    // `refunded`, and forfeit/apply write it off as `uncollectable`.
    //
    // Every OTHER reason — `automatic`, `expired`, and the Stripe-internal
    // `failed_invoice`/`void_invoice`, plus any reason a future SDK adds — means
    // Stripe canceled the intent with nobody here deciding anything. That is the
    // same "authorization died before we could act" condition the
    // no-show/forfeit capture-failure path already lands on `uncollectable` for
    // (#5725 item 3). Inverting the test this way fails toward `uncollectable`
    // (money NOT collected, NOT returned by us) rather than falsely claiming a
    // refund. No Stripe call is made either way — the intent is already canceled.
    if (isDeliberateCancellation(paymentIntent.cancellation_reason)) {
      await depositService.refund(deposit.id, { skipStripeCancel: true });
    } else {
      await depositService.expireAuthorization(deposit.id);
    }
  });
}

// Cancellation reasons a person (staff, the dashboard) or our own API call
// chose. Anything not listed here is treated as a Stripe-internal cancel.
const DELIBERATE_CANCELLATION_REASONS: ReadonlySet<string> = new Set([
  "requested_by_customer",
  "duplicate",
  "fraudulent",
  "abandoned",
]);

function isDeliberateCancellation(reason: Stripe.PaymentIntent.CancellationReason | null): boolean {
  return reason === null || DELIBERATE_CANCELLATION_REASONS.has(reason);
}

async function onChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  // charge.payment_intent is the PaymentIntent ID (string) or a full PaymentIntent object
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

  if (!paymentIntentId) return;

  await withDepositVenueContext(paymentIntentId, async () => {
    const deposit = await depositService.getByPaymentIntentId(paymentIntentId);

    if (!deposit) return;

    // Only transition if currently held
    if (deposit.status === "held") {
      logger.info(
        { depositId: deposit.id, paymentIntentId },
        "charge.refunded received for a held deposit; refunding"
      );
      // Only a live authorization (`requires_capture`) has anything to cancel.
      // A dashboard refund can follow an already-canceled intent, and a held
      // row whose intent `succeeded` was captured and then refunded. Calling
      // cancelPaymentIntent in either case fails, refund() then rolls back and
      // throws (#5753), and Stripe would retry this webhook forever on the 500
      // (#5719 LOW).
      const intent = await stripeService.retrievePaymentIntent(paymentIntentId);
      await depositService.refund(deposit.id, {
        skipStripeCancel: intent.status !== "requires_capture",
      });
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
  });
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
