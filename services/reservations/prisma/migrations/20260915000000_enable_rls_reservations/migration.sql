-- Postgres Row-Level Security venue-scoping backstop (ADR-026), part 3/7.
-- Enables RLS and adds the venue-isolation policy on reservations.
-- Policy is keyed on the app.venue_id session variable, set via
-- `SET LOCAL app.venue_id = '<id>'` by application code (a later issue in the
-- ADR-026 series, not yet landed) -- until that plumbing exists, every
-- session's app.venue_id is unset and current_setting('app.venue_id', true)
-- returns NULL, so reservations becomes invisible to every session
-- (default-deny, see ADR-026 Section 4).
--
-- reservations.venue_id is nullable: per ADR-026 Section 2, a NULL venue_id
-- never equals current_setting(...) under ordinary SQL three-valued
-- comparison, so a NULL-venue_id row is invisible to every session by
-- construction -- no special-cased NULL branch is added to the policy.

-- reservations: venue_id nullable -- NULL rows are invisible to every session (ADR-026 Section 2)
ALTER TABLE "reservations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservation_isolation ON "reservations"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));
