import type { DepositConfig } from "@mbe/types";

export interface EffectiveDepositPolicyParams {
  depositConfig: DepositConfig | null;
  venueSlug: string | undefined;
  stripePublishableKey: string | undefined;
  guestIsRisky: boolean;
}

/**
 * Derives whether a deposit should be collected for this booking.
 *
 * A deposit applies when the venue's Stripe integration is configured
 * (venueSlug + publishable key present) AND either:
 *   - the venue's general deposit policy is enabled, or
 *   - the guest is flagged risky, overriding an otherwise-disabled policy.
 *
 * Returns the (unmodified) `depositConfig` to use, or `null` if no deposit
 * is required.
 */
export function effectiveDepositPolicy({
  depositConfig,
  venueSlug,
  stripePublishableKey,
  guestIsRisky,
}: EffectiveDepositPolicyParams): DepositConfig | null {
  if (!venueSlug || !stripePublishableKey || !depositConfig) return null;
  if (depositConfig.enabled) return depositConfig;
  return guestIsRisky ? depositConfig : null;
}
