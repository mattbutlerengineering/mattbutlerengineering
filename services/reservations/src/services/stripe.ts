import Stripe from "stripe";

/**
 * Typed wrapper for Stripe errors, enriched with `isRetriable` so callers can
 * distinguish permanent failures (card declined, invalid request) from
 * transient ones (connection errors, rate limits) without string-matching
 * error messages.
 */
export class StripeOperationError extends Error {
  readonly isRetriable: boolean;
  readonly stripeType: string;
  readonly cause: unknown;

  constructor(cause: unknown, stripeType: string, isRetriable: boolean) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(message);
    this.name = "StripeOperationError";
    this.cause = cause;
    this.stripeType = stripeType;
    this.isRetriable = isRetriable;
  }
}

/** Stripe error types that are transient and safe to retry. */
const RETRIABLE_STRIPE_TYPES = new Set(["StripeConnectionError", "StripeRateLimitError"]);

/**
 * Wraps a Stripe error in StripeOperationError with retriability metadata.
 * Non-Stripe errors are re-thrown unchanged.
 */
function wrapStripeError(err: unknown): never {
  if (err != null && typeof err === "object" && "type" in err) {
    const stripeType = String((err as { type: string }).type);
    const isRetriable = RETRIABLE_STRIPE_TYPES.has(stripeType);
    throw new StripeOperationError(err, stripeType, isRetriable);
  }
  throw err;
}

export interface CreatePaymentIntentOptions {
  amountCents: number;
  currency: string;
  customerId?: string;
  reservationId: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  id: string;
  status: string;
  clientSecret: string | null;
}

export interface CreateCustomerOptions {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CustomerResult {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * Adapter around the Stripe SDK.
 * All Stripe API calls go through this class so tests can mock it cleanly.
 */
export class StripeService {
  private readonly stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey);
  }

  /**
   * Creates a Stripe PaymentIntent with manual capture (authorize-only hold).
   */
  async createPaymentIntent(options: CreatePaymentIntentOptions): Promise<PaymentIntentResult> {
    const params: Stripe.PaymentIntentCreateParams = {
      amount: options.amountCents,
      currency: options.currency,
      capture_method: "manual",
      metadata: {
        reservationId: options.reservationId,
        ...options.metadata,
      },
    };

    if (options.customerId) {
      params.customer = options.customerId;
    }

    const intent = await this.stripe.paymentIntents.create(params);

    return {
      id: intent.id,
      status: intent.status,
      clientSecret: intent.client_secret,
    };
  }

  /**
   * Captures a previously authorized PaymentIntent (authorize → charge).
   * An optional idempotency key makes safe retries — Stripe returns the
   * original result instead of double-charging.
   */
  async capturePaymentIntent(
    paymentIntentId: string,
    idempotencyKey?: string
  ): Promise<{ id: string; status: string }> {
    try {
      const intent = await this.stripe.paymentIntents.capture(
        paymentIntentId,
        undefined,
        idempotencyKey ? { idempotencyKey } : undefined
      );
      return { id: intent.id, status: intent.status };
    } catch (err) {
      wrapStripeError(err);
    }
  }

  /**
   * Cancels a PaymentIntent (releases the authorization hold).
   * An optional idempotency key makes safe retries — Stripe returns the
   * original result instead of erroring on an already-cancelled intent.
   */
  async cancelPaymentIntent(
    paymentIntentId: string,
    idempotencyKey?: string
  ): Promise<{ id: string; status: string }> {
    try {
      const intent = await this.stripe.paymentIntents.cancel(
        paymentIntentId,
        undefined,
        idempotencyKey ? { idempotencyKey } : undefined
      );
      return { id: intent.id, status: intent.status };
    } catch (err) {
      wrapStripeError(err);
    }
  }

  /**
   * Creates a partial refund on a captured charge associated with a PaymentIntent.
   * Used for late cancellation: capture the hold then refund the un-charged portion.
   * An optional idempotency key makes safe retries — Stripe returns the original
   * refund instead of issuing a duplicate.
   */
  async createPartialRefund(
    paymentIntentId: string,
    refundAmountCents: number,
    idempotencyKey?: string
  ): Promise<{ id: string; status: string; amount: number }> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      const chargeId =
        typeof intent.latest_charge === "string"
          ? intent.latest_charge
          : (intent.latest_charge?.id ?? null);

      if (!chargeId) {
        throw new Error(
          `PaymentIntent ${paymentIntentId} has no associated charge for partial refund`
        );
      }

      const refund = await this.stripe.refunds.create(
        {
          charge: chargeId,
          amount: refundAmountCents,
        },
        idempotencyKey ? { idempotencyKey } : undefined
      );

      return { id: refund.id, status: refund.status ?? "unknown", amount: refund.amount };
    } catch (err) {
      wrapStripeError(err);
    }
  }

  /**
   * Creates a new Stripe customer linked to a guest.
   */
  async createCustomer(options: CreateCustomerOptions): Promise<CustomerResult> {
    const params: Stripe.CustomerCreateParams = {
      metadata: options.metadata,
    };

    if (options.email) {
      params.email = options.email;
    }
    if (options.name) {
      params.name = options.name;
    }

    const customer = await this.stripe.customers.create(params);

    return {
      id: customer.id,
      email: typeof customer.email === "string" ? customer.email : null,
      name: typeof customer.name === "string" ? customer.name : null,
    };
  }

  /**
   * Validates and parses an incoming Stripe webhook payload.
   * Throws if the signature is invalid.
   */
  constructWebhookEvent(payload: Buffer, signature: string, webhookSecret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}

/**
 * Singleton Stripe service instance.
 * Uses STRIPE_SECRET_KEY from environment.
 * Production validation (non-empty assertion) happens in buildApp() via assertStripeSecrets().
 * The placeholder key allows module load in test/dev without a real Stripe key.
 */
export const stripeService = new StripeService(
  process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder"
);
