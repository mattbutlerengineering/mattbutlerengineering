-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spend" DECIMAL(10,2),
    "last_visit" TIMESTAMP(3),
    "tags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guests_venue_id_idx" ON "guests"("venue_id");

-- CreateIndex
CREATE INDEX "guests_venue_id_last_visit_idx" ON "guests"("venue_id", "last_visit");

-- CreateIndex
CREATE UNIQUE INDEX "guests_venue_id_email_key" ON "guests"("venue_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "guests_venue_id_phone_key" ON "guests"("venue_id", "phone");

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "guest_id" TEXT;

-- CreateIndex
CREATE INDEX "reservations_guest_id_idx" ON "reservations"("guest_id");

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
