-- Guest RSVP on a party invite (The Invitation, #8663). Additive: one new enum and one new
-- table, no existing table, column, enum or row changes. First name only, no contact data.

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "reservation_rsvps" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "invite_id" TEXT NOT NULL,
    "first_name" VARCHAR(40) NOT NULL,
    "status" "RsvpStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_rsvps_invite_id_idx" ON "reservation_rsvps"("invite_id");

-- AddForeignKey
ALTER TABLE "reservation_rsvps" ADD CONSTRAINT "reservation_rsvps_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rsvps" ADD CONSTRAINT "reservation_rsvps_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "reservation_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-026 venue-isolation backstop
ALTER TABLE "reservation_rsvps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_rsvps" FORCE ROW LEVEL SECURITY;
CREATE POLICY reservation_rsvp_isolation ON "reservation_rsvps"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

GRANT SELECT, INSERT ON TABLE "reservation_rsvps" TO app_reservations;
