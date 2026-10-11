-- Additive-only migration: one nullable column, no existing data touched.
--
-- Records the booking-widget session (`reservation_holds.session_id`) that
-- confirmed the reservation, copied by `confirmHold` inside the confirm
-- transaction. The public deposit payment-intent route requires the caller
-- to present this session id as proof of ownership before creating a Stripe
-- PaymentIntent (#6304). Existing rows and reservations created outside the
-- widget stay NULL and are rejected by that public route by design. No index:
-- the column is only ever read by reservation primary key.

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "origin_session_id" TEXT;
