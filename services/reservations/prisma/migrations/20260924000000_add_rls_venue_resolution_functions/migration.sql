-- ADR-026 §3.3 / issue #5369, PR 3 of the enforcement sequence: the venue-
-- resolution primitives the FORCE flip's entity-addressed and public-slug
-- blockers (§3.3 items 2-6) will be rebuilt on top of, in later PRs.
--
-- Additive only: no existing policy or function is altered or dropped, and
-- NOTHING here sets FORCE ROW LEVEL SECURITY. This migration only gives the
-- application a safe way to look up "which venue owns this entity" without
-- itself being an unscoped read of an RLS table -- the exact trap §3.3
-- documents (`venueIdFromEntity`'s own load, `resolveReservationVenueId`'s
-- `reservation.findUnique`, the public slug lookups). Wiring routes onto
-- these functions is deliberately out of scope here; see the tracking issue.
--
-- WHY THIS NEEDS THE SAME SECURITY DEFINER + MARKER + OWNER-CONJUNCT SHAPE AS
-- `app_cross_venue_venues` (20260920000000_add_cross_venue_read_escape_hatch):
-- resolving an entity's venue id is, by construction, a read that cannot
-- itself be scoped to that venue -- the id is what the caller is trying to
-- find out. That is a cross-venue read in the same sense §3.1 already
-- reasoned through for the venue list, just addressed by an entity key
-- instead of enumerating every row. The same three properties apply for the
-- same reasons (see that migration's own comments for the measurements):
--   * a bare SECURITY DEFINER function alone does not survive FORCE -- it
--     needs an admitting policy, and cannot admit itself;
--   * the marker is transaction-local and only "on" for the function's own
--     body, restored before returning (or unwound by transaction abort on
--     error -- no exception handler needed);
--   * the owner conjunct costs nothing today (the service connects AS the
--     owner) and becomes the real gate the moment #5369's other half lands.
--
-- `app_cross_venue_venues` itself (separate, already-merged migration) still
-- pins `search_path = pg_catalog, public` without `pg_temp` -- left
-- deliberately untouched here; see the PR discussion for why pg_temp is
-- added to the two NEW functions below but not backfilled onto that one.
--
-- CREATE POLICY takes an AccessExclusiveLock on the target table; six of
-- them below are hot tables under live traffic, so bound how long this
-- migration will wait for that lock rather than risk queuing behind (and
-- blocking) ordinary reads/writes indefinitely.
SET lock_timeout = '5s';

-- One admitting SELECT policy is added per table below (all six RLS tables
-- besides `venues`, whose `venue_cross_venue_read` policy already exists) so
-- the resolver function can read whichever table a given `kind` needs, and so
-- `app_reservation_venue_ids_for_user` can scan `reservations` across venues.
CREATE POLICY floor_plans_cross_venue_read ON "floor_plans"
  FOR SELECT
  USING (
    current_setting('app.cross_venue', true) = 'on'
    AND pg_catalog.pg_has_role(
      current_user,
      (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.floor_plans'::regclass),
      'USAGE'
    )
  );

CREATE POLICY tables_cross_venue_read ON "tables"
  FOR SELECT
  USING (
    current_setting('app.cross_venue', true) = 'on'
    AND pg_catalog.pg_has_role(
      current_user,
      (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.tables'::regclass),
      'USAGE'
    )
  );

CREATE POLICY guests_cross_venue_read ON "guests"
  FOR SELECT
  USING (
    current_setting('app.cross_venue', true) = 'on'
    AND pg_catalog.pg_has_role(
      current_user,
      (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.guests'::regclass),
      'USAGE'
    )
  );

CREATE POLICY reservations_cross_venue_read ON "reservations"
  FOR SELECT
  USING (
    current_setting('app.cross_venue', true) = 'on'
    AND pg_catalog.pg_has_role(
      current_user,
      (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.reservations'::regclass),
      'USAGE'
    )
  );

CREATE POLICY deposits_cross_venue_read ON "deposits"
  FOR SELECT
  USING (
    current_setting('app.cross_venue', true) = 'on'
    AND pg_catalog.pg_has_role(
      current_user,
      (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.deposits'::regclass),
      'USAGE'
    )
  );

CREATE POLICY waitlist_entries_cross_venue_read ON "waitlist_entries"
  FOR SELECT
  USING (
    current_setting('app.cross_venue', true) = 'on'
    AND pg_catalog.pg_has_role(
      current_user,
      (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.waitlist_entries'::regclass),
      'USAGE'
    )
  );

-- app_resolve_venue_id(kind, key, grp): resolves the venue id that owns a
-- single entity, addressed by whichever key the caller already has --
-- exactly the inputs the §3.3 blockers name: a reservation/table/guest/
-- floor-plan/waitlist-entry id, a deposit id or its Stripe payment-intent id
-- (both scoped transitively through `reservations`, per ADR-026 §1/§5), or a
-- venue's own id/slug. Manage/confirm/unsubscribe tokens are NOT a `kind`
-- here: `requireManageToken`/`verifyUnsubscribeToken` verify the HMAC and
-- decode a plain reservation/guest id in application code BEFORE any query
-- runs, so by the time a resolver is needed the caller already holds a
-- `reservation`/`guest` key, not a token.
--
-- `p_group`, when supplied, additionally scopes the `venue`/`venue_slug`
-- kinds to one `venue_group_id` -- `venues.slug` is unique only per group
-- (`@@unique([venueGroupId, slug])`), so a slug lookup with no group can be
-- genuinely ambiguous across groups; see the `venue_slug` branch below for
-- how the no-group case handles that instead of guessing.
--
-- Returns ONLY the resolved venue id (`text`), or `NULL` when the key does
-- not resolve to one -- never a row, so this cannot become a data-leakage
-- path no matter which kind is requested.
--
-- LANGUAGE plpgsql, not sql: a LANGUAGE sql function can be inlined into the
-- calling query (per the sibling function's own comment), which would hoist
-- the lookup out of the marker's scope.
--
-- `p_kind` is validated against a fixed allowlist FIRST -- before even the
-- NULL-key check below -- so an unrecognized kind always raises, including
-- when paired with a NULL key. Validating after the NULL-key check would let
-- `app_resolve_venue_id('bogus-kind', NULL)` silently return NULL instead of
-- raising, indistinguishable from "kind is fine, key just didn't match".
CREATE FUNCTION app_resolve_venue_id(p_kind text, p_key text, p_group text DEFAULT NULL)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $fn$
DECLARE
  prior_marker text;
  result_venue_id text;
  match_count integer;
BEGIN
  IF p_kind NOT IN (
    'reservation', 'table', 'guest', 'floor_plan', 'waitlist_entry',
    'deposit', 'payment_intent', 'venue', 'venue_slug'
  ) THEN
    RAISE EXCEPTION 'app_resolve_venue_id: unknown kind "%"', p_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_key IS NULL THEN
    RETURN NULL;
  END IF;

  prior_marker := current_setting('app.cross_venue', true);
  PERFORM set_config('app.cross_venue', 'on', true);

  CASE p_kind
    WHEN 'reservation' THEN
      SELECT r.venue_id INTO result_venue_id
      FROM public."reservations" r
      WHERE r.id = p_key;
    WHEN 'table' THEN
      SELECT t.venue_id INTO result_venue_id
      FROM public."tables" t
      WHERE t.id = p_key;
    WHEN 'guest' THEN
      SELECT g.venue_id INTO result_venue_id
      FROM public."guests" g
      WHERE g.id = p_key;
    WHEN 'floor_plan' THEN
      SELECT f.venue_id INTO result_venue_id
      FROM public."floor_plans" f
      WHERE f.id = p_key;
    WHEN 'waitlist_entry' THEN
      SELECT w.venue_id INTO result_venue_id
      FROM public."waitlist_entries" w
      WHERE w.id = p_key;
    WHEN 'deposit' THEN
      SELECT r.venue_id INTO result_venue_id
      FROM public."deposits" d
      JOIN public."reservations" r ON r.id = d.reservation_id
      WHERE d.id = p_key;
    WHEN 'payment_intent' THEN
      SELECT r.venue_id INTO result_venue_id
      FROM public."deposits" d
      JOIN public."reservations" r ON r.id = d.reservation_id
      WHERE d.stripe_payment_intent_id = p_key;
    WHEN 'venue' THEN
      SELECT v.id INTO result_venue_id
      FROM public."venues" v
      WHERE v.id = p_key
        AND (p_group IS NULL OR v.venue_group_id = p_group);
    WHEN 'venue_slug' THEN
      IF p_group IS NOT NULL THEN
        -- Scoped by group: the DB's own unique constraint
        -- (`@@unique([venueGroupId, slug])`) guarantees at most one match,
        -- so a plain SELECT INTO is safe here.
        SELECT v.id INTO result_venue_id
        FROM public."venues" v
        WHERE v.slug = p_key
          AND v.venue_group_id = p_group;
      ELSE
        -- No group given: the slug can legitimately collide across groups.
        -- Refuse to guess which venue the caller means -- only resolve when
        -- the slug is globally unambiguous.
        SELECT count(*), min(v.id) INTO match_count, result_venue_id
        FROM public."venues" v
        WHERE v.slug = p_key;

        IF match_count <> 1 THEN
          result_venue_id := NULL;
        END IF;
      END IF;
  END CASE;

  PERFORM set_config('app.cross_venue', coalesce(prior_marker, ''), true);

  RETURN result_venue_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION app_resolve_venue_id(text, text, text) FROM PUBLIC;

-- app_reservation_venue_ids_for_user(user_id): ADR-026 §3.2 item 2
-- (`GET /api/v1/reservations/me`) -- a diner's own reservations can span
-- whatever venues they booked at, so there is no single `app.venue_id` that
-- makes `reservationService.listByUserId` correct under FORCE. This does not
-- fix that route (left to its own reviewed change, per §3.2); it gives it a
-- way to discover the set of venue ids it needs to gather from, the same
-- division of labor `app_cross_venue_venues` gives the admin venue list.
--
-- Returns SETOF text (distinct venue ids only) -- never a reservation row --
-- for the same no-leakage reason as `app_resolve_venue_id` above.
CREATE FUNCTION app_reservation_venue_ids_for_user(p_user_id text)
  RETURNS SETOF text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $fn$
DECLARE
  prior_marker text := current_setting('app.cross_venue', true);
BEGIN
  PERFORM set_config('app.cross_venue', 'on', true);

  RETURN QUERY
    SELECT DISTINCT r.venue_id
    FROM public."reservations" r
    WHERE r.user_id = p_user_id
      AND r.venue_id IS NOT NULL;

  PERFORM set_config('app.cross_venue', coalesce(prior_marker, ''), true);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION app_reservation_venue_ids_for_user(text) FROM PUBLIC;
