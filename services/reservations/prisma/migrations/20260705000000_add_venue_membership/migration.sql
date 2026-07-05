-- CreateEnum
CREATE TYPE "VenueRole" AS ENUM ('owner', 'manager', 'staff');

-- CreateTable: venue_memberships (operator ↔ venue authorization, keyed to Auth0 sub)
CREATE TABLE "venue_memberships" (
    "id" TEXT NOT NULL,
    "user_sub" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "role" "VenueRole" NOT NULL DEFAULT 'staff',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venue_memberships_user_sub_idx" ON "venue_memberships"("user_sub");

-- CreateIndex
CREATE INDEX "venue_memberships_venue_id_idx" ON "venue_memberships"("venue_id");

-- CreateIndex
CREATE UNIQUE INDEX "venue_memberships_user_sub_venue_id_key" ON "venue_memberships"("user_sub", "venue_id");

-- AddForeignKey
ALTER TABLE "venue_memberships" ADD CONSTRAINT "venue_memberships_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
