-- AlterTable
ALTER TABLE "tables" ADD COLUMN "venue_id" TEXT;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "venue_id" TEXT;

-- CreateIndex
CREATE INDEX "tables_venue_id_idx" ON "tables"("venue_id");

-- CreateIndex
CREATE INDEX "reservations_venue_id_date_idx" ON "reservations"("venue_id", "date");
