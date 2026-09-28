-- Additive enum value + nullable column for the deposit state machine.
-- `uncollectable` marks a deposit whose capture failed permanently (e.g. the
-- ~7-day Stripe authorization expired and was auto-canceled) — the money is
-- gone for good, so a no-show can be recorded without the deposit staying
-- stuck in `held` forever (#5719).
-- Non-destructive: ALTER TYPE ... ADD VALUE only appends; no rows are touched.
-- `IF NOT EXISTS` makes the migration idempotent across re-applies.
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'uncollectable';

-- Nullable timestamp recording when a deposit was marked uncollectable,
-- mirroring the existing heldAt/appliedAt/refundedAt/forfeitedAt columns.
ALTER TABLE "deposits" ADD COLUMN "uncollectable_at" TIMESTAMP(3);
