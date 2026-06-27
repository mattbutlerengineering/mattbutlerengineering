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
 * Stripe-backed deposits are an optional feature, so a missing secret must NOT
 * crash the service at boot — it would take down all of reservations (tables,
 * availability, waitlist, …) over a feature that may not even be enabled. Every
 * use-point already fails closed when the secret is absent: the webhook route
 * rejects events it cannot verify (empty secret → 400) and the payment-intent
 * path falls back to a placeholder key so live Stripe calls fail. So in every
 * environment we warn loudly on missing/empty values and let the service boot
 * with deposits disabled. Production gets a sterner warning to surface the
 * misconfiguration in logs.
 */
export function getStripeConfig(input: StripeConfigInput): StripeConfig {
  const isProduction = input.nodeEnv === "production";
  const secretKey = input.secretKey ?? "";
  const webhookSecret = input.webhookSecret ?? "";

  const prefix = isProduction ? "[ERROR]" : "[WARN]";
  const consequence = isProduction
    ? "Stripe deposits are DISABLED in production until this is set."
    : "Set this for local Stripe CLI testing.";

  if (!secretKey) {
    console.warn(`${prefix} STRIPE_SECRET_KEY is not set. ${consequence}`);
  }
  if (!webhookSecret) {
    console.warn(
      `${prefix} STRIPE_WEBHOOK_SECRET is not set. Webhook signature verification will reject all events. ${consequence}`
    );
  }

  return { secretKey, webhookSecret };
}
