-- Grants for app_reservations and FORCE on the seven venue tables.
-- CURRENT_USER is the migrate role and stays the table owner. Membership
-- runs owner -> app_reservations so the owner can SET ROLE. The reverse
-- grant would make the app role a member of the owner.
GRANT app_reservations TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO app_reservations;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "venue_groups",
  "venues",
  "floor_plans",
  "tables",
  "guests",
  "reservations",
  "deposits",
  "waitlist_entries",
  "reservation_holds",
  "venue_memberships"
TO app_reservations;

-- Later tables created by this same migrate role. Omitting a role target
-- makes default privileges apply to current_user.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_reservations;

GRANT EXECUTE ON FUNCTION app_cross_venue_venues(text) TO app_reservations;
GRANT EXECUTE ON FUNCTION app_resolve_venue_id(text, text, text) TO app_reservations;
GRANT EXECUTE ON FUNCTION app_reservation_venue_ids_for_user(text) TO app_reservations;

SET lock_timeout = '5s';

ALTER TABLE "venues" FORCE ROW LEVEL SECURITY;
ALTER TABLE "floor_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tables" FORCE ROW LEVEL SECURITY;
ALTER TABLE "guests" FORCE ROW LEVEL SECURITY;
ALTER TABLE "reservations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "deposits" FORCE ROW LEVEL SECURITY;
ALTER TABLE "waitlist_entries" FORCE ROW LEVEL SECURITY;

RESET lock_timeout;
