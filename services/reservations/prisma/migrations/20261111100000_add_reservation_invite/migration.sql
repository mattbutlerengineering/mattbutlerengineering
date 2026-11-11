-- Forwardable party invite (The Invitation, #8661). Additive: one new table, no existing
-- table, column, enum or row changes. Only the SHA-256 of the token is stored.

-- CreateTable
CREATE TABLE "reservation_invites" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservation_invites_token_hash_key" ON "reservation_invites"("token_hash");

-- CreateIndex
CREATE INDEX "reservation_invites_reservation_id_idx" ON "reservation_invites"("reservation_id");

-- AddForeignKey
ALTER TABLE "reservation_invites" ADD CONSTRAINT "reservation_invites_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_invites" ADD CONSTRAINT "reservation_invites_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-026 venue-isolation backstop
ALTER TABLE "reservation_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_invites" FORCE ROW LEVEL SECURITY;
CREATE POLICY reservation_invite_isolation ON "reservation_invites"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

GRANT SELECT, INSERT, UPDATE ON TABLE "reservation_invites" TO app_reservations;
