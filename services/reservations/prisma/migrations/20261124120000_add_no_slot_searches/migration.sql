-- Lost Demand Ledger (#9484). Additive: one new counter table, no change to an existing one.
-- One row per (venue, date, requested minute, party size); `searches` is incremented per
-- de-duplicated no-slot public availability search. No guest, session, IP or user-agent column.
-- requested_minute is minutes since local midnight, or -1 when the search named no time.

-- CreateTable
CREATE TABLE "no_slot_searches" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "requested_minute" INTEGER NOT NULL,
    "party_size" INTEGER NOT NULL,
    "searches" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "no_slot_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "no_slot_searches_venue_id_date_requested_minute_party_size_key" ON "no_slot_searches"("venue_id", "date", "requested_minute", "party_size");

-- AddForeignKey
ALTER TABLE "no_slot_searches" ADD CONSTRAINT "no_slot_searches_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-026 venue-isolation backstop
ALTER TABLE "no_slot_searches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "no_slot_searches" FORCE ROW LEVEL SECURITY;
CREATE POLICY no_slot_search_isolation ON "no_slot_searches"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

GRANT SELECT, INSERT, UPDATE ON TABLE "no_slot_searches" TO app_reservations;
