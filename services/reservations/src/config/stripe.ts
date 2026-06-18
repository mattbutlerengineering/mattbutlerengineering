export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

interface StripeConfigInput {
  nodeEnv: string | undefined;
  secretKey: string | undefined;
  webhookSecret: string | undefined;
}

/**
 * Validates Stripe environment variables and returns a typed config object.
 *
 * In production: throws if STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET are absent or empty.
 * In non-production: warns loudly but allows empty values (local dev without Stripe CLI).
 */
export function getStripeConfig(input: StripeConfigInput): StripeConfig {
  const isProduction = input.nodeEnv === "production";
  const secretKey = input.secretKey ?? "";
  const webhookSecret = input.webhookSecret ?? "";

  if (isProduction) {
    if (!secretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY is required in production. Set this environment variable to your Stripe secret key."
      );
    }
    if (!webhookSecret) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is required in production. Set this environment variable to your Stripe webhook signing secret."
      );
    }
  } else {
    if (!secretKey) {
      console.warn(
        "[WARN] STRIPE_SECRET_KEY is not set. Stripe payments will not work. Set this for local Stripe CLI testing."
      );
    }
    if (!webhookSecret) {
      console.warn(
        "[WARN] STRIPE_WEBHOOK_SECRET is not set. Webhook signature verification will fail. Set this when using the Stripe CLI."
      );
    }
  }

  return { secretKey, webhookSecret };
}
