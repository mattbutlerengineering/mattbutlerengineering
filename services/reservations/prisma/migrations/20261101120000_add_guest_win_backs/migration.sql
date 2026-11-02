-- Win-back send record (#8041). Additive: one new table, no change to an existing one.
-- guest_id is UNIQUE: that constraint, not a read-then-write check, is what stops two
-- simultaneous sends from both claiming the guest. claimed_at is written BEFORE the provider
-- call; sent_at only after it returns success, so a claim with no matching sent_at is an
-- unconfirmed attempt. A definite provider rejection nulls claimed_at (a retry can claim).

-- CreateTable
CREATE TABLE "guest_win_backs" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "claimed_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_win_backs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_win_backs_guest_id_key" ON "guest_win_backs"("guest_id");

-- CreateIndex
CREATE INDEX "guest_win_backs_venue_id_idx" ON "guest_win_backs"("venue_id");

-- AddForeignKey
ALTER TABLE "guest_win_backs" ADD CONSTRAINT "guest_win_backs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_win_backs" ADD CONSTRAINT "guest_win_backs_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-026 venue-isolation backstop
ALTER TABLE "guest_win_backs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guest_win_backs" FORCE ROW LEVEL SECURITY;
CREATE POLICY guest_win_back_isolation ON "guest_win_backs"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

GRANT SELECT, INSERT, UPDATE ON TABLE "guest_win_backs" TO app_reservations;
