-- Additive-only migration: one new table, no existing data touched.
--
-- `table_events` is an append-only log of every `tables.status` transition
-- (the `tables` row stays the source of truth; no backfill, not event
-- sourcing). ADR-026 backstop in the same migration: RLS is ENABLEd and FORCEd
-- with a venue-isolation policy, and `app_reservations` is granted SELECT and
-- INSERT only -- no UPDATE or DELETE -- so append-only is enforced by the
-- database for the app role.
--
-- `venue_id` is NOT NULL on purpose: under FORCE RLS a NULL-venue row can never
-- pass WITH CHECK. A table with a NULL `venue_id` therefore gets no events; the
-- recording helper skips those tables. `reservation_id` is deliberately not a
-- foreign key: it names the booking a transition belonged to and the history
-- must outlive it.

-- CreateTable
CREATE TABLE "table_events" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "from_status" "TableStatus" NOT NULL,
    "to_status" "TableStatus" NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "reservation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "table_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "table_events_table_id_created_at_idx" ON "table_events"("table_id", "created_at");

-- CreateIndex
CREATE INDEX "table_events_venue_id_created_at_idx" ON "table_events"("venue_id", "created_at");

-- AddForeignKey
ALTER TABLE "table_events" ADD CONSTRAINT "table_events_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_events" ADD CONSTRAINT "table_events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-026 venue-isolation backstop
ALTER TABLE "table_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "table_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY table_event_isolation ON "table_events"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- Append-only for the app role: deliberately no UPDATE or DELETE.
GRANT SELECT, INSERT ON TABLE "table_events" TO app_reservations;
