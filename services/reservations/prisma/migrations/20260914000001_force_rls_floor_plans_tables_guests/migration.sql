-- Postgres RLS venue-scoping backstop (ADR-026), part 2/7 follow-up.
--
-- ENABLE ROW LEVEL SECURITY (previous migration) does not apply to the
-- table owner. The reservations service and its migration job connect
-- with the same DATABASE_URL/role, which is the owner of these tables --
-- so without FORCE, the app's own queries bypass the venue_isolation
-- policies entirely. FORCE ROW LEVEL SECURITY makes RLS apply to the
-- owning role's ordinary DML too (superuser and BYPASSRLS roles still
-- bypass it, but this app's role is neither). See issue #5369.

ALTER TABLE "floor_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tables" FORCE ROW LEVEL SECURITY;
ALTER TABLE "guests" FORCE ROW LEVEL SECURITY;
