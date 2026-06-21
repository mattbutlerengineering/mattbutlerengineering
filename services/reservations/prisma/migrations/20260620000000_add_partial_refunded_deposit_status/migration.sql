-- Additive enum value for the deposit state machine.
-- `partial_refunded` distinguishes a partial refund (late cancellation /
-- partial no-show fee) from a full `refunded` and a full `forfeited`.
-- Non-destructive: ALTER TYPE ... ADD VALUE only appends; no rows are touched.
-- `IF NOT EXISTS` makes the migration idempotent across re-applies.
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'partial_refunded';
