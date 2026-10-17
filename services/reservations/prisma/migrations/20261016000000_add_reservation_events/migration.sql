-- Additive-only migration: one new table, no existing data touched.
--
-- `reservation_events` is an append-only log of what happened to a reservation
-- (the `reservations` row stays the source of truth; no backfill, not event
-- sourcing). ADR-026 backstop in the same migration: RLS is ENABLEd and
-- FORCEd with a venue-isolation policy, and `app_reservations` is granted
-- SELECT and INSERT only -- no UPDATE or DELETE -- so append-only is enforced
-- by the database for the app role.
--
-- `venue_id` is NOT NULL on purpose: under FORCE RLS a NULL-venue row can never
-- pass WITH CHECK. A reservation with a NULL `venue_id` therefore gets no
-- events; the recording helper skips those reservations.

-- CreateTable
CREATE TABLE "reservation_events" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "from_state" JSONB,
    "to_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_events_reservation_id_created_at_idx" ON "reservation_events"("reservation_id", "created_at");

-- CreateIndex
CREATE INDEX "reservation_events_venue_id_created_at_idx" ON "reservation_events"("venue_id", "created_at");

-- AddForeignKey
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-026 venue-isolation backstop
ALTER TABLE "reservation_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY reservation_event_isolation ON "reservation_events"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- Append-only for the app role: deliberately no UPDATE or DELETE.
GRANT SELECT, INSERT ON TABLE "reservation_events" TO app_reservations;
