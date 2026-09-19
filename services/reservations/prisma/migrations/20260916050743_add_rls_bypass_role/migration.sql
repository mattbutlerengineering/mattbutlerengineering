-- Postgres Row-Level Security venue-scoping backstop (ADR-026), part 7/7.
-- Creates the app_rls_bypass role ADR-026 Section 3 specifies: a narrowly
-- scoped escape hatch for the audited cross-venue reads that legitimately
-- need to see rows across every venue. It is invoked via
-- `SET ROLE app_rls_bypass` immediately before the specific cross-venue
-- query and `RESET ROLE` immediately after, inside the same
-- transaction/connection checkout (see src/services/rls-bypass.ts).
--
-- Without this role, the RLS policies enabled by the earlier migrations in
-- this series make every cross-venue query -- including
-- src/services/lapsed-guest-cron.ts's per-venue guest scan, which has no
-- HTTP request context and therefore no app.venue_id session variable --
-- silently return zero rows (ADR-026 Section 4 default-deny), not an error.
--
-- BYPASSRLS: makes every RLS policy a no-op for a session that has SET ROLE
-- into this role, regardless of app.venue_id.
-- NOLOGIN: this role is never connected to directly -- only switched into,
-- via SET ROLE, by a role that is already a member of it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls_bypass') THEN
    CREATE ROLE app_rls_bypass NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- Grants membership in app_rls_bypass to whichever role runs this migration.
-- In this service, migrations and the application share one DATABASE_URL
-- (infrastructure/pulumi/index.ts), so this is also the app's own connection
-- role -- it can now `SET ROLE app_rls_bypass`. Idempotent: granting a role
-- membership that already exists is a no-op, no guard needed.
GRANT app_rls_bypass TO CURRENT_USER;

-- SET ROLE replaces the session's effective privilege set with
-- app_rls_bypass's own grants -- it does not additionally inherit whatever
-- the original role could already do. Grant SELECT only on the two tables
-- the audited cross-venue read path (lapsed-guest-cron's per-venue guest
-- scan, which also reads each guest's completed reservations) actually
-- needs -- not a blanket grant across every RLS-protected table.
GRANT SELECT ON "guests", "reservations" TO app_rls_bypass;
