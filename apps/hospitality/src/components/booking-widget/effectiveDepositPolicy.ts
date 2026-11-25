import type { DepositConfig } from "@mbe/types";

export interface EffectiveDepositPolicyParams {
  depositConfig: DepositConfig | null;
  venueSlug: string | undefined;
  stripePublishableKey: string | undefined;
  /**
   * The server's verdict for this booking, from the confirm response. It
   * covers a guest the venue requires a deposit from (e.g. repeat no-shows),
   * which the widget can neither see nor decide. `false` before confirm.
   */
  serverRequiresDeposit: boolean;
}

/**
 * Derives whether a deposit should be collected for this booking.
 *
 * A deposit applies when the venue's Stripe integration is configured
 * (venueSlug + publishable key present) AND either:
 *   - the venue's general deposit policy is enabled, or
 *   - the server says this booking needs one, overriding an otherwise-disabled
 *     policy.
 *
 * Returns the (unmodified) `depositConfig` to use, or `null` if no deposit
 * is required.
 */
export function effectiveDepositPolicy({
  depositConfig,
  venueSlug,
  stripePublishableKey,
  serverRequiresDeposit,
}: EffectiveDepositPolicyParams): DepositConfig | null {
  if (!venueSlug || !stripePublishableKey || !depositConfig) return null;
  if (depositConfig.enabled) return depositConfig;
  return serverRequiresDeposit ? depositConfig : null;
}

/**
 * Provisional deposit-required guess used before the server's verdict is
 * known — e.g. right after the venue's deposit config is fetched, pre-confirm.
 * Delegates to `effectiveDepositPolicy` with `serverRequiresDeposit: false` so
 * it can never independently drift from the final verdict — in particular, it
 * accounts for `stripePublishableKey` being absent, not just the venue's
 * general `.enabled` flag. `CONFIRM_SUCCESS_WITH_DEPOSIT` /
 * `CONFIRM_SUCCESS_NO_DEPOSIT` later overwrite this with the final verdict.
 */
export function provisionalDepositRequired(
  depositConfig: DepositConfig | null,
  venueSlug: string | undefined,
  stripePublishableKey: string | undefined
): boolean {
  return (
    effectiveDepositPolicy({
      depositConfig,
      venueSlug,
      stripePublishableKey,
      serverRequiresDeposit: false,
    }) !== null
  );
}
