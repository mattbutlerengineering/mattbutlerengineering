-- Postgres Row-Level Security venue-scoping backstop (ADR-026).
-- Enables RLS and adds the venue-isolation policy on venues -- the one
-- table in ADR-026's table list scoped by the row's own id rather than a
-- separate venue_id column (ADR-026 Section 1). The 7-part implementation
-- series (parts 2-4 migrated floor_plans/tables/guests/reservations/
-- deposits/waitlist_entries; parts 5-7 landed the app.venue_id plumbing and
-- its integration test) left this table's own policy outstanding -- this
-- migration completes it per ADR-026 Section 5's spec.
--
-- Policy is keyed on the app.venue_id session variable, set via
-- `SELECT set_config('app.venue_id', '<id>', true)` by application code
-- (`src/services/venue-scoped-prisma.ts`'s `withVenueScopedQueries`) --
-- until that value is set for a given session, current_setting('app.venue_id', true)
-- returns NULL, so venues becomes invisible to every session
-- (default-deny, see ADR-026 Section 4).

-- venues: the row's own id is the venue identifier (no separate venue_id column)
ALTER TABLE "venues" ENABLE ROW LEVEL SECURITY;
CREATE POLICY venue_isolation ON "venues"
  FOR ALL
  USING (id = current_setting('app.venue_id', true))
  WITH CHECK (id = current_setting('app.venue_id', true));
