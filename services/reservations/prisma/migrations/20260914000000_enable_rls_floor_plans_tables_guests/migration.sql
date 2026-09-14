-- Postgres Row-Level Security venue-scoping backstop (ADR-026), part 2/7.
-- Enables RLS and adds venue-isolation policies on floor_plans, tables, guests.
-- Policies are keyed on the app.venue_id session variable, set via
-- `SET LOCAL app.venue_id = '<id>'` by application code (a later issue in the
-- ADR-026 series, not yet landed) -- until that plumbing exists, every
-- session's app.venue_id is unset and current_setting('app.venue_id', true)
-- returns NULL, so all three tables become invisible to every session
-- (default-deny, see ADR-026 Section 4).
--
-- tables.venue_id is nullable: per ADR-026 Section 2, a NULL venue_id never
-- equals current_setting(...) under ordinary SQL three-valued comparison, so
-- a NULL-venue_id row is invisible to every session by construction -- no
-- special-cased NULL branch is added to the policy.

-- floor_plans: venue_id NOT NULL
ALTER TABLE "floor_plans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY floor_plan_isolation ON "floor_plans"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- tables: venue_id nullable -- NULL rows are invisible to every session (ADR-026 Section 2)
ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;
CREATE POLICY table_isolation ON "tables"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- guests: venue_id NOT NULL
ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_isolation ON "guests"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));
