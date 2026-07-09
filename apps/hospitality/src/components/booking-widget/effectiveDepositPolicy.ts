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

/**
 * Whether checking guest risk could still change the deposit verdict. When
 * the venue's general policy already requires a deposit, risk is
 * irrelevant to the outcome — callers can skip the (network) risk lookup
 * and its guest PII (email/phone) entirely.
 *
 * This is the single source of truth for that "is it worth checking?"
 * question — call sites must not re-derive it from `depositConfig.enabled`
 * independently, or they risk drifting from `effectiveDepositPolicy`'s own
 * gating.
 */
export function guestRiskMatters(
  depositConfig: DepositConfig | null,
  venueSlug: string | undefined,
  stripePublishableKey: string | undefined
): boolean {
  return !depositConfig?.enabled && Boolean(venueSlug) && Boolean(stripePublishableKey);
}

/**
 * Provisional deposit-required guess used before guest risk is known — e.g.
 * right after the venue's deposit config is fetched, pre-confirm. Keys off
 * the venue's general policy alone, matching `effectiveDepositPolicy` called
 * with `guestIsRisky: false`. `CONFIRM_SUCCESS_WITH_DEPOSIT` /
 * `CONFIRM_SUCCESS_NO_DEPOSIT` later overwrite this with the final,
 * risk-aware verdict from `effectiveDepositPolicy`.
 */
export function provisionalDepositRequired(depositConfig: DepositConfig | null): boolean {
  return Boolean(depositConfig?.enabled);
}
