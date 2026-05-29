-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('pending', 'held', 'applied', 'refunded', 'forfeited');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('flat', 'per_person');

-- AlterTable: Add deposit policy fields to venues
ALTER TABLE "venues" ADD COLUMN "deposit_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "venues" ADD COLUMN "deposit_type" "DepositType";
ALTER TABLE "venues" ADD COLUMN "deposit_amount_cents" INTEGER;
ALTER TABLE "venues" ADD COLUMN "free_cancellation_hours" INTEGER;
ALTER TABLE "venues" ADD COLUMN "late_cancellation_fee_percent" INTEGER;
ALTER TABLE "venues" ADD COLUMN "no_show_fee_percent" INTEGER;

-- AlterTable: Add stripeCustomerId to guests
ALTER TABLE "guests" ADD COLUMN "stripe_customer_id" TEXT;

-- CreateIndex: unique stripe customer id on guests
CREATE UNIQUE INDEX "guests_stripe_customer_id_key" ON "guests"("stripe_customer_id");

-- CreateTable: deposits
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "DepositStatus" NOT NULL DEFAULT 'pending',
    "stripe_payment_intent_id" TEXT,
    "stripe_customer_id" TEXT,
    "held_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "forfeited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deposits_reservation_id_key" ON "deposits"("reservation_id");

-- CreateIndex
CREATE INDEX "deposits_reservation_id_idx" ON "deposits"("reservation_id");

-- CreateIndex
CREATE INDEX "deposits_stripe_payment_intent_id_idx" ON "deposits"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
