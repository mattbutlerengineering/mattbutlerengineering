import Stripe from "stripe";

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
   */
  async capturePaymentIntent(paymentIntentId: string): Promise<{ id: string; status: string }> {
    const intent = await this.stripe.paymentIntents.capture(paymentIntentId);
    return { id: intent.id, status: intent.status };
  }

  /**
   * Cancels a PaymentIntent (releases the authorization hold).
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<{ id: string; status: string }> {
    const intent = await this.stripe.paymentIntents.cancel(paymentIntentId);
    return { id: intent.id, status: intent.status };
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
  constructWebhookEvent(
    payload: Buffer,
    signature: string,
    webhookSecret: string
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}

/**
 * Singleton Stripe service instance.
 * Uses STRIPE_SECRET_KEY from environment (falls back to empty string for tests).
 */
export const stripeService = new StripeService(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder");
