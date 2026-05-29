-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('waiting', 'notified', 'seated', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "party_size" INTEGER NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_phone" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "estimated_wait_minutes" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'waiting',
    "notified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waitlist_entries_venue_id_status_idx" ON "waitlist_entries"("venue_id", "status");
