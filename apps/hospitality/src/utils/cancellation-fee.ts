/**
 * Re-exports the shared cancellation policy engine from @mbe/cancellation-policy.
 *
 * The canonical fee evaluation logic lives in the shared package; this module
 * exists for backward-compatibility with existing imports inside apps/hospitality.
 */
export type { CancellationPolicy, FeeType, CancellationFeeResult } from "@mbe/cancellation-policy";
export { evaluateCancellationFee, formatCancellationTerms } from "@mbe/cancellation-policy";
