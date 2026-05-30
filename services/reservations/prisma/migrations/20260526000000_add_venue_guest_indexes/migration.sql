-- perf(reservations): add missing indexes for slow Prisma queries
-- Fixes: FloorPlan.findMany 691ms, Venue.findMany 100-116ms, Guest.count 103ms

-- CreateIndex: venues.venue_group_id — used in venueService.list() where filter
CREATE INDEX "venues_venue_group_id_idx" ON "venues"("venue_group_id");

-- CreateIndex: guests.(venue_id, visit_count) — used in getSegments() VIP/New count queries
CREATE INDEX "guests_venue_id_visit_count_idx" ON "guests"("venue_id", "visit_count");
