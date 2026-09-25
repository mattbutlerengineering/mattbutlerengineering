-- Additive-only migration: one nullable column, no existing data touched.
--
-- Records the cumulative amount (in cents), sourced directly from Stripe's
-- own `amount_refunded` on the underlying charge, refunded AFTER a deposit
-- already reached a capture-based terminal status (`applied`/`forfeited`/
-- `partial_refunded`) -- e.g. a refund issued through the Stripe dashboard
-- after our own capture. Reconciliation only: it never changes `status`, so
-- the existing terminal status stays an accurate record of how our own
-- state machine resolved the capture (#5725).

ALTER TABLE "deposits" ADD COLUMN "post_capture_refund_cents" INTEGER;
