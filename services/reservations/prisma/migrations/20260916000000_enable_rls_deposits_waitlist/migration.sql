-- Postgres Row-Level Security venue-scoping backstop (ADR-026), part 4/7.
-- Enables RLS and adds venue-isolation policies on waitlist_entries and deposits.
-- Policies are keyed on the app.venue_id session variable, set via
-- `SET LOCAL app.venue_id = '<id>'` by application code (a later issue in the
-- ADR-026 series, not yet landed) -- until that plumbing exists, every
-- session's app.venue_id is unset and current_setting('app.venue_id', true)
-- returns NULL, so both tables become invisible to every session
-- (default-deny, see ADR-026 Section 4).

-- waitlist_entries: venue_id NOT NULL
ALTER TABLE "waitlist_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY waitlist_isolation ON "waitlist_entries"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- deposits: no venue_id column -- scope transitively through reservations
-- (ADR-026 Section 5). A Deposit for a Reservation with venue_id IS NULL is
-- therefore also invisible under this policy, consistent with Section 2.
ALTER TABLE "deposits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY deposit_isolation ON "deposits"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "reservations" r
      WHERE r.id = deposits.reservation_id
        AND r.venue_id = current_setting('app.venue_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "reservations" r
      WHERE r.id = deposits.reservation_id
        AND r.venue_id = current_setting('app.venue_id', true)
    )
  );
