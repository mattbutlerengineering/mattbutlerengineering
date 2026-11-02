-- AlterTable
ALTER TABLE "availability_changes" ADD COLUMN     "version" INTEGER;

-- CreateIndex
CREATE INDEX "availability_changes_venue_id_version_idx" ON "availability_changes"("venue_id", "version");
