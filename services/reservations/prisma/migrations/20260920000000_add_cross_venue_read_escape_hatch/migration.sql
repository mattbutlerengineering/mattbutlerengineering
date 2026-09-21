-- ADR-026 Section 3's two OPEN PREREQUISITE cross-venue reads, closed (issue #5369).
--
-- Additive only: no existing policy is altered or dropped, and NOTHING here sets
-- FORCE ROW LEVEL SECURITY. This migration makes the eventual FORCE flip safe for
-- the two reads that would otherwise silently return zero rows; the flip itself is
-- a separate, reviewed change.
--
-- WHY A BARE SECURITY DEFINER FUNCTION IS NOT ENOUGH (measured, Postgres 16.13,
-- non-superuser table owner -- the shape DigitalOcean Managed Postgres gives us):
-- a SECURITY DEFINER function owned by the table owner does read every venue
-- today, but only because Postgres skips RLS for a table's owner while FORCE is
-- absent -- the very bypass #5369 is about. With FORCE set, the same function
-- returns ZERO rows: inside the definer's context current_user IS the owner, and
-- FORCE is precisely the flag that stops the owner being exempt. So the function
-- needs a policy that admits it; it cannot admit itself.
--
-- The admitting predicate has two conjuncts, and both are load-bearing:
--
--   1. current_setting('app.cross_venue', true) = 'on'
--      A transaction-local marker set by the function below and restored before
--      it returns, so the window in which venues is readable across venues is the
--      function call itself -- not the surrounding transaction. On error the
--      (sub)transaction abort unwinds the GUC stack, so no EXCEPTION handler is
--      needed to restore it.
--
--   2. the reader is (a member of) the table's own owner
--      Today the service connects AS the owner, so this conjunct is satisfied by
--      every query and conjunct 1 is what gates the hatch -- no weaker than the
--      SET ROLE app_rls_bypass marker ADR-026 originally specified, which any
--      application code could equally have issued. The moment #5369's remaining
--      half lands (the service connecting as a NON-owner role), this conjunct
--      makes the hatch unforgeable from application code: measured, a non-owner
--      that sets the marker itself still reads zero rows, while the same role
--      calling the function below reads every venue. It is written against
--      pg_class.relowner rather than a literal role name so it follows the real
--      owner across deployments (doadmin in production, a scratch role in CI) and
--      across a restore, instead of silently going false on a rename.
--
-- Rejected here: a dedicated BYPASSRLS role (ADR-026 Section 3 measured it
-- unprovisionable -- only a superuser or an existing BYPASSRLS role may grant that
-- attribute, and this platform grants no superuser), and the marker GUC on its own
-- (no named database object to grant or audit, no bounded projection, and it stays
-- set for the rest of the caller's transaction).
CREATE POLICY venue_cross_venue_read ON "venues"
  FOR SELECT
  USING (
    current_setting('app.cross_venue', true) = 'on'
    AND pg_catalog.pg_has_role(
      current_user,
      (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.venues'::regclass),
      'USAGE'
    )
  );

-- The one escape hatch for ADR-026 Section 3's cross-venue reads:
--   * the lapsed-guest cron's venue list (getAllVenueIds)
--   * the platform-admin venue list (venueService.list)
--
-- SELECT-only by construction: the policy above is FOR SELECT, so no cross-venue
-- INSERT/UPDATE/DELETE is reachable through the marker (measured: an UPDATE under
-- the marker touches 0 rows and an INSERT is rejected by venue_isolation's
-- WITH CHECK). Returns SETOF venues so the row type tracks the table automatically
-- and callers can apply their own filter/ORDER BY/LIMIT/count over it.
--
-- LANGUAGE plpgsql, not sql: a LANGUAGE sql set-returning function can be inlined
-- into the calling query, which would hoist the venues scan out of any context
-- that sets the marker. plpgsql is never inlined, so the marker is guaranteed to
-- be set before the scan runs.
--
-- The marker is set in the BODY rather than via CREATE FUNCTION's SET clause
-- because that clause is not available to us: measured, a non-superuser owner gets
-- "permission denied to set parameter app.cross_venue" when a custom GUC is named
-- in a function's SET clause (it needs superuser, or GRANT SET ON PARAMETER, which
-- likewise needs superuser).
CREATE FUNCTION app_cross_venue_venues(p_venue_group_id text DEFAULT NULL)
  RETURNS SETOF "venues"
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $fn$
DECLARE
  prior_marker text := current_setting('app.cross_venue', true);
BEGIN
  PERFORM set_config('app.cross_venue', 'on', true);

  RETURN QUERY
    SELECT v.*
    FROM public."venues" v
    WHERE p_venue_group_id IS NULL OR v.venue_group_id = p_venue_group_id;

  PERFORM set_config('app.cross_venue', coalesce(prior_marker, ''), true);
END;
$fn$;

-- A SECURITY DEFINER function is EXECUTE-able by PUBLIC unless revoked. The table
-- owner keeps EXECUTE implicitly, which is the role the service connects as today,
-- so this needs no companion GRANT now -- but whichever change moves the service
-- onto a non-owner role must GRANT EXECUTE on this function to that role, or the
-- cron's venue list and the admin venue list go blind under FORCE.
REVOKE EXECUTE ON FUNCTION app_cross_venue_venues(text) FROM PUBLIC;
