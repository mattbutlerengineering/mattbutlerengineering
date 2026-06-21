import type { DepositConfig } from "@mbe/types";
import { formatCurrencyFromCents } from "../../utils/format.js";

/**
 * Returns a plain-language cancellation policy summary for display in the
 * booking widget confirmation step. Returns null when no policy is configured.
 *
 * NOTE: This duplicates the backend `formatCancellationTerms`
 * (services/reservations/src/services/cancellation-policy.ts). The backend
 * formatter is not importable from the frontend (it lives inside the service),
 * so the wording — including the fee dollar amount — is mirrored here. Keep the
 * two in sync; a future cleanup could move the formatter to @mbe/types or have
 * the public venue API return a pre-formatted summary.
 */
export function formatDepositCancellationTerms(config: DepositConfig | null): string | null {
  if (!config || config.freeCancellationHours == null) return null;
  const feePercent = config.lateCancellationFeePercent ?? 0;
  const feeAmountCents = Math.floor(((config.amountCents ?? 0) * feePercent) / 100);
  const formattedFee = formatCurrencyFromCents(feeAmountCents, config.currency);
  return (
    `Free cancellation up to ${config.freeCancellationHours} hours before your reservation. ` +
    `After that, a ${feePercent}% fee (${formattedFee}) applies.`
  );
}
