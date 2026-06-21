/**
 * Re-exports the shared cancellation policy engine from @mbe/cancellation-policy.
 *
 * Pure fee evaluation logic lives in the shared package so both this service
 * and apps/hospitality can import without duplication. The `DepositAction` type
 * and the `depositAction` field on CancellationFeeResult are part of the shared
 * contract — they drive Stripe state transitions on the backend and are available
 * to the frontend for display purposes.
 *
 * Backend-specific deposit state-machine logic (refund/forfeit/capture calls)
 * remains in services/deposit.ts.
 */
export type {
  CancellationPolicy,
  FeeType,
  DepositAction,
  CancellationFeeResult,
} from "@mbe/cancellation-policy";
export { evaluateCancellationFee, formatCancellationTerms } from "@mbe/cancellation-policy";
