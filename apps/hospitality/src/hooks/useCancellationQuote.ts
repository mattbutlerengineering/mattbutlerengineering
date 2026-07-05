/**
 * Single owner of the staff "cancel with fee" quote.
 *
 * "What we told the guest" (the displayed fee + label) and "what we did" (the
 * executed cancellation) previously lived in different modules and were never
 * reconciled: the dialog re-derived the fee at render and formatted its own
 * label, while the cancel mutation knew nothing about it. This module makes the
 * interface explicit — one quote (policy + timing → fee + label) that both the
 * dialog and the cancel mutation consume, so a single evaluation drives both.
 */
import { evaluateCancellationFee } from "@mbe/cancellation-policy";
import type { CancellationPolicy, CancellationFeeResult } from "@mbe/cancellation-policy";
import { formatCurrencyFromCents } from "../utils/format.js";
import { useVenuePolicy } from "./useVenuePolicy.js";

export interface CancellationQuote {
  /** Fee evaluation — "what we did": amounts, refund, and deposit action. */
  fee: CancellationFeeResult;
  /** Plain-language label — "what we told the guest". */
  label: string;
  /** ISO currency code used to format the label (e.g. "usd"). */
  currency: string;
}

/** Builds the plain-language fee label shown to staff before they confirm. */
function buildFeeLabel(fee: CancellationFeeResult, currency: string): string {
  const feeAmount = formatCurrencyFromCents(fee.feeAmountCents, currency);
  const refundAmount = formatCurrencyFromCents(fee.refundAmountCents, currency);
  switch (fee.feeType) {
    case "none":
      return `No cancellation fee — full refund of ${refundAmount}`;
    case "late":
      return `Late cancellation fee: ${feeAmount} — refund ${refundAmount}`;
    case "noshow":
      return `No-show fee: ${feeAmount} forfeited — refund ${refundAmount}`;
  }
}

/**
 * Pure evaluation of the cancellation quote. Returns `null` when the venue has
 * no cancellation policy — callers hide the fee section entirely in that case.
 *
 * `now` is injectable for deterministic testing; production callers omit it.
 */
export function evaluateCancellationQuote(
  policy: CancellationPolicy | null,
  reservationTime: Date,
  currency = "usd",
  now: Date = new Date()
): CancellationQuote | null {
  if (!policy) return null;
  const fee = evaluateCancellationFee(policy, reservationTime, now);
  return { fee, label: buildFeeLabel(fee, currency), currency };
}

/**
 * Folds the quoted fee into the persisted cancellation note so the executed
 * cancellation records what the guest was quoted. The reservations service is
 * authoritative for the actual refund, but the note is the only persisted
 * surface that ties "what we told the guest" to "what we did". No-op for free
 * cancellations, where there is no fee to reconcile.
 */
export function withQuotedFeeNote(note: string, quote: CancellationQuote | null): string {
  if (!quote || quote.fee.feeType === "none") return note;
  const audit = `Quoted at cancellation: ${quote.label}`;
  return note ? `${note}\n${audit}` : audit;
}

export interface UseCancellationQuoteParams {
  /** Venue slug used to fetch the cancellation policy. */
  slug: string | undefined;
  /** The reservation start time. When absent, no quote is produced. */
  reservationTime: Date | undefined;
  /** ISO currency code (e.g. "usd"). Defaults to "usd". */
  currency?: string;
}

/**
 * Resolves the cancellation quote for a reservation by reusing the re-pointed
 * `useVenuePolicy` (which reads `api.venues.getPublicConfig`) — the policy is
 * fetched once and the quote is derived locally; the raw config is never
 * re-fetched here.
 */
export function useCancellationQuote({
  slug,
  reservationTime,
  currency = "usd",
}: UseCancellationQuoteParams): {
  quote: CancellationQuote | null;
  isLoading: boolean;
} {
  const { policy, isLoading } = useVenuePolicy(slug);
  const quote = reservationTime
    ? evaluateCancellationQuote(policy, reservationTime, currency)
    : null;
  return { quote, isLoading };
}
