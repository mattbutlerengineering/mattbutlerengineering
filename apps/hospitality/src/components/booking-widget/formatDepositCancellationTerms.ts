import type { DepositConfig } from "@mbe/types";
import { formatCancellationTerms, quoteDeposit } from "@mbe/cancellation-policy";
import type { CancellationPolicy } from "@mbe/cancellation-policy";

/**
 * Returns a plain-language cancellation policy summary for display in the
 * booking widget (payment step + confirmation step). Returns null when no
 * policy is configured — callers hide the policy card entirely in that case.
 *
 * Delegates the wording to the shared `formatCancellationTerms` in
 * `@mbe/cancellation-policy` — the same formatter the backend uses — so the
 * two surfaces can never drift out of sync.
 *
 * `partySize` is required: late-cancellation and no-show fees are evaluated
 * against the actual charged deposit total (`quoteDeposit`), not the
 * per-person base — for `per_person` venues those two amounts differ.
 */
export function formatDepositCancellationTerms(
  config: DepositConfig | null,
  partySize: number
): string | null {
  if (!config || config.freeCancellationHours == null) return null;
  const policy: CancellationPolicy = {
    depositAmountCents: quoteDeposit(config, partySize),
    freeCancellationHours: config.freeCancellationHours,
    lateCancellationFeePercent: config.lateCancellationFeePercent,
    noShowFeePercent: config.noShowFeePercent,
  };
  return formatCancellationTerms(policy, config.currency);
}
