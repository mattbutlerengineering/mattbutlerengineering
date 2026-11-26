-- Regulars Club membership (#9623). Additive: one new table, no change to an existing one.

-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('REGULAR');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "guest_memberships" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL DEFAULT 'REGULAR',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "guest_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_memberships_venue_id_guest_id_key" ON "guest_memberships"("venue_id", "guest_id");

-- AddForeignKey
ALTER TABLE "guest_memberships" ADD CONSTRAINT "guest_memberships_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_memberships" ADD CONSTRAINT "guest_memberships_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-026 venue-isolation backstop
ALTER TABLE "guest_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guest_memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY guest_membership_isolation ON "guest_memberships"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

GRANT SELECT, INSERT, UPDATE ON TABLE "guest_memberships" TO app_reservations;
