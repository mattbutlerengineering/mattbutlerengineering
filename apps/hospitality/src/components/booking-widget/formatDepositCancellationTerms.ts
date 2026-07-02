import type { DepositConfig } from "@mbe/types";
import { formatCancellationTerms } from "@mbe/cancellation-policy";
import type { CancellationPolicy } from "@mbe/cancellation-policy";

/**
 * Returns a plain-language cancellation policy summary for display in the
 * booking widget (payment step + confirmation step). Returns null when no
 * policy is configured — callers hide the policy card entirely in that case.
 *
 * Delegates the wording to the shared `formatCancellationTerms` in
 * `@mbe/cancellation-policy` — the same formatter the backend uses — so the
 * two surfaces can never drift out of sync.
 */
export function formatDepositCancellationTerms(config: DepositConfig | null): string | null {
  if (!config || config.freeCancellationHours == null) return null;
  const policy: CancellationPolicy = {
    depositAmountCents: config.amountCents ?? 0,
    freeCancellationHours: config.freeCancellationHours,
    lateCancellationFeePercent: config.lateCancellationFeePercent,
    noShowFeePercent: config.noShowFeePercent,
  };
  return formatCancellationTerms(policy, config.currency);
}
