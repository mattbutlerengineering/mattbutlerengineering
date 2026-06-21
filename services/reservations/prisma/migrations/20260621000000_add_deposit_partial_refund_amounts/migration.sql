-- AddColumn: persist resolved fee and refund amounts on deposits
-- Additive-only migration: two nullable columns, no existing data touched.
-- These columns are populated at the time of a partial refund transition so
-- that a retry crossing the no-show boundary can replay refundPartial from
-- the persisted amounts rather than re-deriving the action from the clock.

ALTER TABLE "deposits" ADD COLUMN "fee_amount_cents" INTEGER;
ALTER TABLE "deposits" ADD COLUMN "refund_amount_cents" INTEGER;
